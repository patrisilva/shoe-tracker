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

function sender(): string {
  return (
    process.env.MAIL_FROM?.trim() ||
    // Resend's shared sender, which needs no domain of your own.
    "Shoe Rack <onboarding@resend.dev>"
  );
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

async function sendViaSmtp(mail: Mail, url: string): Promise<MailResult> {
  // Imported lazily so the SMTP client is not pulled into a build that only
  // ever uses Resend.
  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport(url);

  await transport.sendMail({
    from: sender(),
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
  return { delivered: true, via: "smtp" };
}

export function mailerConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY || process.env.SMTP_URL);
}

export async function sendMail(mail: Mail): Promise<MailResult> {
  const resendKey = process.env.RESEND_API_KEY?.trim();
  const smtpUrl = process.env.SMTP_URL?.trim();

  if (smtpUrl) return sendViaSmtp(mail, smtpUrl);
  if (resendKey) return sendViaResend(mail, resendKey);

  console.warn(
    `[mail] No RESEND_API_KEY or SMTP_URL set. Not sending. To: ${mail.to}\n` +
      `[mail] ${mail.subject}\n${mail.text}`
  );
  return { delivered: false, via: "console" };
}
