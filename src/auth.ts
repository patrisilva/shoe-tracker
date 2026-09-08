import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { authConfig } from "@/auth.config";
import { verifyPassword } from "@/lib/password";
import { normaliseEmail } from "@/lib/password-rules";

export { enabledProviders } from "@/auth.config";

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
