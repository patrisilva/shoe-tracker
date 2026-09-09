import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";
import { sendMail } from "@/lib/mailer";

/**
 * "Confirm your email" links.
 *
 * The raw token only ever exists in the URL that gets emailed; the database
 * keeps a SHA-256 of it. A stolen database therefore cannot confirm anyone's
 * account, and there is no secret to rotate.
 */

const TOKEN_BYTES = 32;
const TTL_HOURS = 24;
/** How long before another link can be requested for the same account. */
export const RESEND_COOLDOWN_SECONDS = 60;

/**
 * Whether a new email account has to confirm before it can be used.
 *
 * Off by default, so registration works out of the box. Turning it on is a
 * deliberate act because it depends on outbound mail actually working from
 * wherever this is deployed — and on Railway that rules out every SMTP
 * provider, since outbound SMTP is blocked on all ports.
 *
 * Deliberately not inferred from "is a mail provider configured": a provider
 * that is set but broken would then silently start refusing every sign-in,
 * which is the failure this flag exists to avoid.
 */
export function verificationRequired(): boolean {
  return process.env.REQUIRE_EMAIL_VERIFICATION?.trim().toLowerCase() === "true";
}

function hash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function verifyUrl(token: string): string {
  const base = (process.env.AUTH_URL || "http://localhost:3000").replace(
    /\/+$/,
    ""
  );
  return `${base}/verify?token=${token}`;
}

function body(link: string): { text: string; html: string } {
  const text = [
    "Confirm your email to finish setting up Shoe Rack.",
    "",
    link,
    "",
    `This link works once and expires in ${TTL_HOURS} hours.`,
    "If you did not sign up, ignore this email — no account will be usable.",
  ].join("\n");

  const html = `<!doctype html>
<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:32rem;margin:0 auto;padding:2rem 1rem;color:#131a2b">
  <p style="font-size:1.05rem;margin:0 0 1.25rem">Confirm your email to finish setting up Shoe Rack.</p>
  <p style="margin:0 0 1.5rem">
    <a href="${link}" style="display:inline-block;background:#ff5a1f;color:#fff;font-weight:600;text-decoration:none;padding:0.8rem 1.5rem;border-radius:12px">Confirm my email</a>
  </p>
  <p style="font-size:0.85rem;color:#5b6b84;margin:0 0 0.5rem">Or paste this into your browser:</p>
  <p style="font-size:0.8rem;color:#5b6b84;word-break:break-all;margin:0 0 1.5rem">${link}</p>
  <p style="font-size:0.8rem;color:#8b99ad;margin:0">
    This link works once and expires in ${TTL_HOURS} hours.
    If you did not sign up, ignore this email — no account will be usable.
  </p>
</div>`;

  return { text, html };
}

export type IssueResult =
  | { ok: true; delivered: boolean }
  | { ok: false; reason: "cooldown"; retryInSeconds: number };

/**
 * Issues a fresh link, replacing any pending one.
 *
 * Refuses if one was sent moments ago, so neither sign-up nor the resend
 * button can be used to flood someone's inbox.
 */
export async function issueVerification(
  userId: string,
  email: string
): Promise<IssueResult> {
  const existing = await prisma.emailVerification.findUnique({
    where: { userId },
    select: { sentAt: true },
  });

  if (existing) {
    const age = (Date.now() - existing.sentAt.getTime()) / 1000;
    if (age < RESEND_COOLDOWN_SECONDS) {
      return {
        ok: false,
        reason: "cooldown",
        retryInSeconds: Math.ceil(RESEND_COOLDOWN_SECONDS - age),
      };
    }
  }

  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const expires = new Date(Date.now() + TTL_HOURS * 60 * 60 * 1000);

  await prisma.emailVerification.upsert({
    where: { userId },
    create: { userId, tokenHash: hash(token), expires, sentAt: new Date() },
    update: { tokenHash: hash(token), expires, sentAt: new Date() },
  });

  const link = verifyUrl(token);
  const { text, html } = body(link);
  const result = await sendMail({
    to: email,
    subject: "Confirm your email for Shoe Rack",
    text,
    html,
  });

  return { ok: true, delivered: result.delivered };
}

export type ConsumeResult =
  | { ok: true; email: string | null }
  | { ok: false; reason: "invalid" | "expired" };

/**
 * Redeems a token, marks the account verified and removes the row.
 *
 * Single use: the delete happens in the same transaction as the update, so a
 * link that is opened twice fails the second time.
 */
export async function consumeVerification(
  rawToken: string
): Promise<ConsumeResult> {
  const token = rawToken?.trim();
  if (!token) return { ok: false, reason: "invalid" };

  const record = await prisma.emailVerification.findUnique({
    where: { tokenHash: hash(token) },
    select: { id: true, userId: true, expires: true, tokenHash: true },
  });
  if (!record) return { ok: false, reason: "invalid" };

  // The lookup was already by hash, so this only guards against a partial
  // match being treated as a hit.
  const a = Buffer.from(record.tokenHash);
  const b = Buffer.from(hash(token));
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "invalid" };
  }

  if (record.expires.getTime() < Date.now()) {
    await prisma.emailVerification.delete({ where: { id: record.id } });
    return { ok: false, reason: "expired" };
  }

  const [user] = await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { emailVerified: new Date() },
      select: { email: true },
    }),
    prisma.emailVerification.delete({ where: { id: record.id } }),
  ]);

  return { ok: true, email: user.email };
}

/** Password accounts must confirm; OAuth accounts are vouched for already. */
export async function needsVerification(email: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { passwordHash: true, emailVerified: true },
  });
  if (!user) return false;
  return Boolean(user.passwordHash) && user.emailVerified === null;
}
