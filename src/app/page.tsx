import { redirect } from "next/navigation";
import { auth, signIn, enabledProviders } from "@/auth";
import { DistanceRail } from "@/components/DistanceRail";
import { computeDistance } from "@/lib/shoe";

export default async function Home() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  // Signed-out marketing sample. New accounts start in miles.
  const sample = computeDistance(0, 342, 400);

  return (
    <main className="shell">
      <header className="masthead">
        <span className="wordmark">Shoe Rack</span>
      </header>

      <section className="gate">
        <h1>Know when your shoes are done.</h1>
        <p className="lede">
          Add a pair, log the miles you put on it, and watch the gap close on 400.
          Shoe Rack keeps reviews and current prices for the exact model you own,
          so replacing a pair takes a minute instead of an evening.
        </p>

        <div className="gate-actions">
          {enabledProviders.includes("google") && (
            <form
              action={async () => {
                "use server";
                await signIn("google", { redirectTo: "/dashboard" });
              }}
            >
              <button className="btn btn-solid" type="submit">
                Continue with Google
              </button>
            </form>
          )}

          {enabledProviders.includes("apple") && (
            <form
              action={async () => {
                "use server";
                await signIn("apple", { redirectTo: "/dashboard" });
              }}
            >
              <button className="btn" type="submit">
                Continue with Apple
              </button>
            </form>
          )}

          {enabledProviders.length === 0 && (
            <p className="error">
              No sign-in provider is configured. Set AUTH_GOOGLE_ID and
              AUTH_GOOGLE_SECRET, then redeploy.
            </p>
          )}
        </div>

        <div className="sample-rail">
          <div className="rack-head">
            <span className="shoe-title">Brooks Ghost 16</span>
            <span className={`odometer state-${sample.state}`}>
              342<small>mi</small>
            </span>
          </div>
          <DistanceRail distance={sample} unit="MI" />
          <p className="meta" style={{ marginTop: "0.5rem" }}>
            58 miles left before this pair comes off the rack.
          </p>
        </div>
      </section>
    </main>
  );
}
