/**
 * Who is allowed to have an account.
 *
 * `ALLOWED_EMAILS` is a comma-separated list. When it is set, only those
 * addresses can sign up or sign in — by any route, including Google, which is
 * the part an email-verification flow would not have covered.
 *
 * Deliberately no dependencies and no database access: this is imported by
 * auth.config.ts, which has to stay runnable in the edge middleware.
 *
 * When the variable is unset the allowlist is off and anyone can register.
 * Failing open is the safer default for a check keyed on an environment
 * variable — a typo in the list would otherwise lock the owner out of their
 * own app with no way back in through the UI.
 */

/** Parsed list, or null when the allowlist is disabled. */
export function allowedEmails(): string[] | null {
  const raw = process.env.ALLOWED_EMAILS?.trim();
  if (!raw) return null;

  const list = raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  return list.length > 0 ? list : null;
}

export function allowlistEnabled(): boolean {
  return allowedEmails() !== null;
}

/**
 * Compared lowercased, because providers are inconsistent about the case they
 * hand back and nobody expects Me@Example.com to be a different person.
 */
export function isAllowed(email: string | null | undefined): boolean {
  const list = allowedEmails();
  if (list === null) return true;
  if (!email) return false;
  return list.includes(email.trim().toLowerCase());
}

/** Shown to someone who is turned away. Says what to do, not just "no". */
export const ACCESS_DENIED_MESSAGE =
  "This rack is invite only. Ask the owner to add your email address.";
