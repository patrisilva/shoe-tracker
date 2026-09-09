import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Apple from "next-auth/providers/apple";
import { isAllowed } from "@/lib/access";

/**
 * Edge-safe half of the auth setup. It holds providers and callbacks but no
 * database adapter, so middleware can import it without pulling Prisma into
 * the edge runtime.
 */
const providers: NextAuthConfig["providers"] = [];

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      allowDangerousEmailAccountLinking: true,
    })
  );
}

// Apple needs a paid developer account and a signed-JWT client secret, so it
// is wired up only when both values are present. Google alone is a valid setup.
if (process.env.AUTH_APPLE_ID && process.env.AUTH_APPLE_SECRET) {
  providers.push(
    Apple({
      clientId: process.env.AUTH_APPLE_ID,
      clientSecret: process.env.AUTH_APPLE_SECRET,
      allowDangerousEmailAccountLinking: true,
    })
  );
}

export const enabledProviders = providers.map(
  (p) => (p as unknown as { id: string }).id
);

export const authConfig = {
  providers,
  // JWT sessions keep middleware off the database, which matters on the edge.
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },
  pages: { signIn: "/", error: "/" },
  callbacks: {
    /**
     * The single gate every route passes through.
     *
     * Runs for Google and for email/password alike, so an address that is not
     * on the allowlist cannot get in by switching provider. Returning false
     * sends them to the sign-in page with `?error=AccessDenied`.
     */
    signIn({ user, profile }) {
      return isAllowed(user?.email ?? profile?.email ?? null);
    },
    jwt({ token, user }) {
      if (user) token.uid = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.uid) session.user.id = token.uid as string;
      return session;
    },
  },
} satisfies NextAuthConfig;
