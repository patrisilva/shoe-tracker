/**
 * Sending mail, via whichever provider is configured.
 *
 * Three are supported, and the choice is forced by where this runs: Railway
 * drops outbound SMTP on every port — 587, 465 and 2525 all time out from
 * inside a container, while HTTPS is fine — so anything SMTP-based is a dead
 * end there however valid the credentials are.
 *
 * - `BREVO_API_KEY` — HTTPS, and a single sender address can be verified
 *   without owning a domain, so a plain Gmail address works as the From. The
 *   only one of the three that both survives the SMTP block and can mail
 *   strangers with no domain.
 * - `RESEND_API_KEY` — also HTTPS, nicer to work with, but mailing arbitrary
 *   recipients needs a verified *domain*; its shared sender reaches only the
 *   account owner.
 * - `SMTP_URL` — kept for hosts that permit outbound SMTP, and for local
 *   development against a sink. Will not work on Railway.
 *
 * Checked in that order. With none set, mail is written to the server log,
 * which keeps local development credential-free and makes the gap visible
 * rather than silent.
 */

export type Mail = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type MailResult = { delivered: boolean; via: string };

/**
 * Who the mail comes from.
 *
 * `MAIL_FROM` wins. Failing that the address is derived from the SMTP
 * username, because most providers — Gmail among them — reject or silently
 * rewrite a From that is not the authenticated mailbox. Defaulting to Resend's
 * sender while sending over Gmail was a quiet way to lose every email.
 */
function sender(): string {
  const explicit = process.env.MAIL_FROM?.trim();
  if (explicit) return explicit;

  // An SMTP username is a real mailbox, so it doubles as a sensible From for
  // the HTTPS providers too — which matters because Brevo verifies exactly
  // that sort of single address.
  const smtpUrl = process.env.SMTP_URL?.trim();
  if (smtpUrl) {
    try {
      const user = decodeURIComponent(new URL(smtpUrl).username);
      if (user.includes("@")) return `Shoe Rack <${user}>`;
    } catch {
      // Unparseable SMTP_URL: fall through and let the provider complain
      // about the From rather than guessing at it.
    }
  }

  // Resend's shared sender, which needs no domain of your own.
  return "Shoe Rack <onboarding@resend.dev>";
}

/** Splits `Name <addr@host>` into the parts Brevo's JSON API expects. */
function splitSender(raw: string): { email: string; name?: string } {
  const match = raw.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (match) return { email: match[2].trim(), name: match[1] || undefined };
  return { email: raw.trim() };
}

async function sendViaBrevo(mail: Mail, key: string): Promise<MailResult> {
  const from = splitSender(sender());

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": key,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: from,
      to: [{ email: mail.to }],
      subject: mail.subject,
      textContent: mail.text,
      htmlContent: mail.html,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    // Brevo names the cause in the body — an unverified sender is the usual
    // one, and it is worth seeing verbatim.
    const detail = await res.text().catch(() => "");
    throw new Error(`Brevo ${res.status}: ${detail.slice(0, 300)}`);
  }
  return { delivered: true, via: "brevo" };
}

async function sendViaResend(mail: Mail, key: string): Promise<MailResult> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: sender(),
      to: [mail.to],
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    // Resend explains refusals in the body — an unverified domain or a
    // recipient the shared sender is not allowed to reach both land here.
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${detail.slice(0, 300)}`);
  }
  return { delivered: true, via: "resend" };
}

/**
 * Every stage is bounded.
 *
 * Nodemailer's defaults are minutes long, and several hosts silently drop
 * outbound SMTP rather than refusing it — the socket just hangs. Unbounded,
 * that left the sign-up action awaiting forever and the button stuck on
 * "Sending link…" with nothing in the log. Better to fail in seconds and say
 * so.
 */
const SMTP_TIMEOUT_MS = 10_000;

async function sendViaSmtp(mail: Mail, url: string): Promise<MailResult> {
  // Imported lazily so the SMTP client is not pulled into a build that only
  // ever uses Resend.
  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport(url, {
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
  });

  try {
    await transport.sendMail({
      from: sender(),
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
    return { delivered: true, via: "smtp" };
  } finally {
    // Otherwise the pool keeps the process's event loop busy.
    transport.close();
  }
}

export function mailerConfigured(): boolean {
  return Boolean(
    process.env.BREVO_API_KEY ||
      process.env.RESEND_API_KEY ||
      process.env.SMTP_URL
  );
}

export async function sendMail(mail: Mail): Promise<MailResult> {
  const brevoKey = process.env.BREVO_API_KEY?.trim();
  const resendKey = process.env.RESEND_API_KEY?.trim();
  const smtpUrl = process.env.SMTP_URL?.trim();

  // HTTPS providers first: on a host that blocks outbound SMTP, preferring
  // SMTP_URL because it happens to be set would guarantee failure.
  if (brevoKey) {
    try {
      return await sendViaBrevo(mail, brevoKey);
    } catch (err) {
      console.error(`[mail] Brevo send failed for ${mail.to}: ${String(err).slice(0, 250)}`);
      return { delivered: false, via: "brevo-failed" };
    }
  }

  if (resendKey) {
    try {
      return await sendViaResend(mail, resendKey);
    } catch (err) {
      console.error(`[mail] Resend send failed for ${mail.to}: ${String(err).slice(0, 250)}`);
      return { delivered: false, via: "resend-failed" };
    }
  }

  if (smtpUrl) {
    try {
      return await sendViaSmtp(mail, smtpUrl);
    } catch (err) {
      // Logged with the provider's own wording, because that is what names
      // the cause: EAUTH for bad credentials, ETIMEDOUT for a host that drops
      // outbound SMTP. The caller reports "not delivered" either way rather
      // than pretending the mail went out.
      const e = err as { code?: string; responseCode?: number; message?: string };
      console.error(
        `[mail] SMTP send failed for ${mail.to}: code=${e.code ?? "?"} ` +
          `responseCode=${e.responseCode ?? "?"} ${(e.message ?? "").slice(0, 200)}`
      );
      return { delivered: false, via: "smtp-failed" };
    }
  }

  console.warn(
    `[mail] No BREVO_API_KEY, RESEND_API_KEY or SMTP_URL set. Not sending. ` +
      `To: ${mail.to}\n` +
      `[mail] ${mail.subject}\n${mail.text}`
  );
  return { delivered: false, via: "console" };
}
