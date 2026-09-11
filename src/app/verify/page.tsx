import Link from "next/link";
import { Logo } from "@/components/Logo";
import { consumeVerification } from "@/lib/verification";

export const dynamic = "force-dynamic";

/**
 * Where the emailed link lands.
 *
 * The token is redeemed during render, so opening the link is what confirms
 * the account. It is single use — a second visit reports an invalid link
 * rather than silently succeeding.
 */
export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const result = await consumeVerification(token ?? "");

  return (
    <>
      <div className="shell">
        <header className="masthead">
          <Logo href="/" />
        </header>

        <section className="hero">
          {result.ok ? (
            <>
              <span className="badge">Email confirmed</span>
              <h1>
                You are all set.
                <span className="turn">Time to build the rack.</span>
              </h1>
              <p className="lede">
                {result.email
                  ? `${result.email} is confirmed.`
                  : "Your address is confirmed."}{" "}
                Sign in and add your first pair.
              </p>
              <div className="hero-cta">
                <Link className="btn btn-solid btn-lg" href="/">
                  Sign in
                </Link>
              </div>
            </>
          ) : (
            <>
              <h1>
                {result.reason === "expired"
                  ? "That link has expired."
                  : "That link is not valid."}
              </h1>
              <p className="lede">
                {result.reason === "expired"
                  ? "Confirmation links last 24 hours. Sign in with your email and password and we will send a fresh one."
                  : "It may already have been used, or the address was cut short in your email client. Sign in and we will send a new link."}
              </p>
              <div className="hero-cta">
                <Link className="btn btn-solid btn-lg" href="/">
                  Back to sign in
                </Link>
              </div>
            </>
          )}
        </section>
      </div>

      <footer className="site-foot">Shoe Rack. Built for runners.</footer>
    </>
  );
}
