import bcrypt from "bcryptjs";

/**
 * Password hashing. Server only — importing this from a client component would
 * bundle bcryptjs into the browser. The rules that the sign-up form needs live
 * in password-rules.ts, which has no dependencies.
 *
 * bcryptjs rather than a native binding so the Railway build needs no compiler.
 * Cost 12 is around 250ms on Railway's shared CPU — slow enough to be a real
 * barrier, fast enough that sign-in does not feel broken.
 */
const COST = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
