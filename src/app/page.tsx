import { redirect } from "next/navigation";
import { auth, enabledProviders } from "@/auth";
import { DistanceRail } from "@/components/DistanceRail";
import { SignInButton } from "@/components/SignInButton";
import { EmailAuthForm } from "@/components/EmailAuthForm";
import { computeDistance, formatDistance, wearMessage } from "@/lib/shoe";
import { verificationRequired } from "@/lib/verification";

function BoltIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5Z" />
    </svg>
  );
}

function GaugeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M5 20v-6M12 20V8M19 20v-9" />
    </svg>
  );
}

function PulseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12h4l2.5-7 4 14L15.5 12H22" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  // Auth.js bounces a failed sign-in back here with ?error=... The code is
  // never echoed: it arrives in the URL and is not ours to trust.
  const { error } = await searchParams;
  const signInFailed = Boolean(error);
  const mustConfirm = verificationRequired();

  // The hero is the gauge doing its actual job, not a decorative stat: a pair
  // 40 miles from the line, in the amber band, reading exactly as it would on
  // a real rack.
  const sample = computeDistance(0, 360, 400);

  return (
    <>
      <div className="shell">
        <header className="masthead">
          <span className="wordmark">Shoe Rack</span>
        </header>

        <section className="hero">
          <span className="badge">
            <BoltIcon />
            Stop running on dead foam
          </span>

          <h1>
            Know exactly when to
            <span className="turn">retire your shoes.</span>
          </h1>

          <p className="lede">
            Runners track everything except the one thing that wears out. Log
            your runs against each pair, watch the gap close, and replace them
            before your knees make the decision for you.
          </p>

          <div className="hero-cta">
            <div className="auth-card">
              {signInFailed && (
                <p className="error">
                  That sign-in did not go through. Try again.
                </p>
              )}

              {enabledProviders.length > 0 && (
                <>
                  <div className="provider-stack">
                    {enabledProviders.includes("google") && (
                      <SignInButton provider="google" />
                    )}
                    {enabledProviders.includes("apple") && (
                      <SignInButton provider="apple" />
                    )}
                  </div>
                  <div className="auth-split">or use your email</div>
                </>
              )}

              <EmailAuthForm requireVerification={mustConfirm} />
            </div>

            {/* Set the expectation before the form is filled in, so the
                "check your inbox" screen is not a surprise. */}
            <p className="gate-note">
              {mustConfirm
                ? "New email accounts confirm their address first. Google sign-in needs no confirmation — Google has already done it."
                : "Signing in creates your rack on first use — there is no separate sign-up."}
            </p>
          </div>
        </section>

        <section aria-label="What a pair looks like on the rack">
          <div className="rack-item">
            <div className="rack-head">
              <span className="shoe-title">
                Brooks Ghost 16
                <span className="shoe-nickname"> Daily blues</span>
              </span>
              <span className={`odometer state-${sample.state}`}>
                <span className="num">{formatDistance(sample.distance)}</span>
                <small>mi</small>
              </span>
            </div>
            <DistanceRail distance={sample} unit="MI" />
            <div className="rack-foot">
              <span className={`chip state-${sample.state}`}>
                {wearMessage(sample, "MI")}
              </span>
              <span>Last run 8.4 mi on Sep 6</span>
            </div>
          </div>
        </section>

        <section className="features">
          <div className="feature">
            <span className="feature-icon">
              <GaugeIcon />
            </span>
            <h3>Miles that add up</h3>
            <p>
              Log each run against the pair you wore. Starting mileage carries
              over, so shoes you already own count from day one.
            </p>
          </div>
          <div className="feature">
            <span className="feature-icon">
              <PulseIcon />
            </span>
            <h3>Wear you can see</h3>
            <p>
              Every pair carries a gauge that shifts green to amber to red as it
              approaches your replacement threshold.
            </p>
          </div>
          <div className="feature">
            <span className="feature-icon">
              <ShieldIcon />
            </span>
            <h3>Reviews and prices</h3>
            <p>
              When a pair is nearly done, the reviews and current prices for
              that exact model are already on its page.
            </p>
          </div>
        </section>
      </div>

      <footer className="site-foot">Shoe Rack. Built for runners.</footer>
    </>
  );
}
