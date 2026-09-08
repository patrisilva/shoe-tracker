/**
 * Password and email rules, with no crypto dependency.
 *
 * Split out from password.ts on purpose: the sign-up form is a client
 * component and needs the minimum length to render its own validation, and
 * importing it from password.ts would pull bcryptjs into the browser bundle.
 */

/** bcrypt silently truncates past 72 bytes, so the cap is explicit instead. */
export const MAX_PASSWORD_BYTES = 72;
export const MIN_PASSWORD_LENGTH = 10;

/** Returns a message to show the user, or null when the password is fine. */
export function checkPassword(plain: string): string | null {
  if (plain.length < MIN_PASSWORD_LENGTH)
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (new TextEncoder().encode(plain).length > MAX_PASSWORD_BYTES)
    return "That password is too long. Trim it to about 70 characters.";
  // Length is doing the work here; a character-class rule would only push
  // people towards Password1! and is no longer recommended practice.
  if (/^\s+$/.test(plain)) return "Enter a password.";
  return null;
}

/** Light touch: catches typos, not an attempt at full RFC validation. */
export function normaliseEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return null;
  return email;
}
