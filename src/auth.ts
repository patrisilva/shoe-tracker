import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { authConfig } from "@/auth.config";
import { verifyPassword } from "@/lib/password";
import { normaliseEmail } from "@/lib/password-rules";
import { verificationRequired } from "@/lib/verification";

export { enabledProviders } from "@/auth.config";

/**
 * Thrown by `authorize` when the password is right but the address has not
 * been confirmed. Auth.js surfaces `code` on the sign-in error, which is how
 * the form knows to offer a resend rather than saying "wrong password".
 */
export class EmailNotVerifiedError extends CredentialsSignin {
  code = "email_not_verified";
}

/**
 * Email and password sign-in.
 *
 * Deliberately not in auth.config.ts: `authorize` touches Prisma and bcrypt,
 * and that file has to stay importable from the edge middleware. Middleware
 * only verifies an already-issued JWT, so it never needs this provider.
 */
const credentials = Credentials({
  name: "Email",
  credentials: {
    email: { label: "Email", type: "email" },
    password: { label: "Password", type: "password" },
  },
  async authorize(raw) {
    const email = normaliseEmail(String(raw?.email ?? ""));
    const password = String(raw?.password ?? "");
    if (!email || !password) return null;

    const user = await prisma.user.findUnique({ where: { email } });

    // No password hash means an OAuth-only account. Compare against a dummy
    // hash anyway so a missing account and a Google-only account take the
    // same time to answer, and neither is distinguishable from a wrong
    // password. Returning null early would leak which emails exist.
    const hash =
      user?.passwordHash ??
      "$2a$12$Q7dQFZ6nBoTPMsQPB.hL9uJ8lPQ0gkQqW7Yk8ZLQ0gkQqW7Yk8ZLQ";

    const ok = await verifyPassword(password, hash);
    if (!ok || !user?.passwordHash) return null;

    // Correct password, but the address has not been confirmed. Refused here
    // rather than in the signIn callback so the reason can be distinguished
    // from a wrong password — the form offers to resend the link. Only applies
    // when confirmation is switched on; otherwise the column is ignored and
    // accounts created while it was on still work.
    if (verificationRequired() && user.emailVerified === null) {
      throw new EmailNotVerifiedError();
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
    };
  },
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  ...authConfig,
  providers: [...authConfig.providers, credentials],
});
