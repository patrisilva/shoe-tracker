/**
 * Sending mail, via whichever provider is configured.
 *
 * Two are supported because they fail in opposite ways:
 *
 * - `RESEND_API_KEY` — an HTTP call, nothing to install. But Resend will only
 *   deliver to arbitrary recipients once you have verified a sending domain;
 *   on its shared `onboarding@resend.dev` sender it delivers only to the
 *   account owner's own address. Fine for a private rack, not for open
 *   registration.
 * - `SMTP_URL` — e.g. a Gmail app password. Delivers to anyone straight away
 *   with no domain to own, which is what open registration actually needs.
 *
 * With neither set, mail is written to the server log instead of being sent.
 * That keeps local development working without credentials, and makes the
 * missing configuration obvious rather than silent.
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
  return Boolean(process.env.RESEND_API_KEY || process.env.SMTP_URL);
}

export async function sendMail(mail: Mail): Promise<MailResult> {
  const resendKey = process.env.RESEND_API_KEY?.trim();
  const smtpUrl = process.env.SMTP_URL?.trim();

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

  if (resendKey) {
    try {
      return await sendViaResend(mail, resendKey);
    } catch (err) {
      console.error(`[mail] Resend send failed for ${mail.to}: ${String(err).slice(0, 250)}`);
      return { delivered: false, via: "resend-failed" };
    }
  }

  console.warn(
    `[mail] No RESEND_API_KEY or SMTP_URL set. Not sending. To: ${mail.to}\n` +
      `[mail] ${mail.subject}\n${mail.text}`
  );
  return { delivered: false, via: "console" };
}
