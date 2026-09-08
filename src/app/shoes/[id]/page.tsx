import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { DistanceRail } from "@/components/DistanceRail";
import { LogRunForm } from "@/components/LogRunForm";
import { ReviewsSection } from "@/components/ReviewsSection";
import { RunRow } from "@/components/RunRow";
import { HeroPhoto } from "@/components/HeroPhoto";
import { deleteShoe, toggleRetired } from "@/app/actions";
import { MAX_REVIEW_LINKS, sourceName } from "@/lib/links";
import { formatPrice } from "@/lib/price-provider";
import { cheapest } from "@/lib/refresh";
import {
  computeDistance,
  formatDate,
  formatDistance,
  wearMessage,
} from "@/lib/shoe";
import { unitLabel } from "@/lib/units";

export const dynamic = "force-dynamic";

export default async function ShoePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { unit: true },
  });
  // A JWT for a deleted account would otherwise 404 here, which reads as "no
  // such shoe" rather than "you are not signed in any more".
  if (!user) redirect("/api/auth/signout");

  const unit = user.unit;
  const u = unitLabel(unit);

  const shoe = await prisma.shoe.findFirst({
    where: { id, userId: session.user.id },
    include: {
      runs: { orderBy: { ranOn: "desc" }, take: 50 },
      links: { orderBy: { position: "asc" } },
      // Just the timestamp: enough to know a photo exists without loading it.
      image: { select: { updatedAt: true } },
    },
  });
  if (!shoe) notFound();

  const total = await prisma.run.aggregate({
    where: { shoeId: shoe.id },
    _sum: { distance: true },
  });
  const m = computeDistance(
    shoe.startingDistance,
    total._sum.distance ?? 0,
    shoe.lifespanDistance
  );

  // Latest snapshot batch only.
  const latest = await prisma.priceSnapshot.findFirst({
    where: { shoeId: shoe.id },
    orderBy: { checkedAt: "desc" },
    select: { checkedAt: true },
  });
  const prices = latest
    ? await prisma.priceSnapshot.findMany({
        where: {
          shoeId: shoe.id,
          checkedAt: { gte: new Date(latest.checkedAt.getTime() - 60_000) },
        },
        orderBy: { retailer: "asc" },
      })
    : [];
  const best = cheapest(prices);
  const hasRealPrices = prices.some((p) => p.priceCents !== null);

  // Three is enough to compare; more is a list to scroll rather than a choice
  // to make. Cheapest first when real prices exist, otherwise catalogue order.
  const buyAgain = (
    hasRealPrices
      ? [...prices].sort(
          (a, b) => (a.priceCents ?? Infinity) - (b.priceCents ?? Infinity)
        )
      : prices
  ).slice(0, 3);

  const reviews = shoe.links
    .filter((l) => l.kind === "REVIEW")
    .slice(0, MAX_REVIEW_LINKS);

  return (
    <main className="shell">
      <header className="masthead">
        <Link href="/dashboard" className="wordmark">
          Shoe Rack
        </Link>
        <div className="masthead-side">
          <Link href="/dashboard">Back to the rack</Link>
        </div>
      </header>

      <section style={{ paddingTop: "2.5rem" }}>
        <div className="shoe-hero">
          <HeroPhoto shoeId={shoe.id} hasPhoto={Boolean(shoe.image)} />
          <div className="shoe-hero-text">
            <h1 style={{ fontSize: "clamp(1.75rem,4.5vw,2.75rem)" }}>
              {shoe.brand} {shoe.model}
              {shoe.nickname && (
                <span className="shoe-nickname"> {shoe.nickname}</span>
              )}
            </h1>
          </div>
        </div>

        <div className="rack-head" style={{ marginTop: "1.25rem" }}>
          <span className="meta">
            {shoe.runs.length} {shoe.runs.length === 1 ? "run" : "runs"} logged
          </span>
          <span className={`odometer state-${m.state}`}>
            <span className="num">{formatDistance(m.distance)}</span>
            <small>
              of {m.lifespan} {u}
            </small>
          </span>
        </div>

        <DistanceRail distance={m} unit={unit} />

        <div className="rack-foot">
          <span className={`chip state-${m.state}`}>
            {wearMessage(m, unit)}
          </span>
          <span>
            {shoe.startingDistance > 0 && (
              <span>
                Started at {formatDistance(shoe.startingDistance)} {u}
              </span>
            )}
            {shoe.purchasedOn && <span>Bought {formatDate(shoe.purchasedOn)}</span>}
            {shoe.retiredAt && <span>Retired {formatDate(shoe.retiredAt)}</span>}
          </span>
        </div>
      </section>

      <section className="section">
        <h2>Log a run</h2>
        <div style={{ marginTop: "1.5rem" }}>
          <LogRunForm shoeId={shoe.id} unit={unit} />
        </div>
      </section>

      {/* Run log leads, with reviews alongside it: logging is the thing done
          weekly, reading a review the thing done once. */}
      <div className="shoe-columns">
        <section className="section">
          <h2>Run log</h2>
          {shoe.runs.length === 0 ? (
            <p className="empty">
              Nothing logged yet. Your first run shows up here.
            </p>
          ) : (
            <ul className="stack">
              {shoe.runs.map((run) => (
                <RunRow
                  key={run.id}
                  unit={unit}
                  run={{
                    id: run.id,
                    distance: run.distance,
                    ranOn: run.ranOn.toISOString().slice(0, 10),
                    ranOnLabel: formatDate(run.ranOn),
                    notes: run.notes,
                  }}
                />
              ))}
            </ul>
          )}
        </section>

        <aside className="section">
          <h2>Reviews</h2>
          <ReviewsSection
            shoeId={shoe.id}
            needsLookup={shoe.reviewsCheckedAt === null}
            reviews={reviews.map((l) => ({
              id: l.id,
              title: l.title,
              source: l.source,
              url: l.url,
              imageUrl: l.imageUrl,
              excerpt: l.excerpt,
              publishedAt: l.publishedAt,
            }))}
          />
        </aside>
      </div>

      <section className="section">
        <h2>Buy again</h2>
        {buyAgain.length === 0 ? (
          <p className="empty">
            Prices refresh once a day. Nothing has been checked for this pair
            yet.
          </p>
        ) : (
          <>
            <ul className="price-grid">
              {buyAgain.map((p) => {
                const amount = formatPrice(p.priceCents, p.currency);
                const isBest = best?.id === p.id;
                return (
                  <li
                    key={p.id}
                    className={`price-row${isBest ? " is-best" : ""}`}
                  >
                    {/* With a live price the number leads. Without one there is
                        no number to lead with, so the retailer does — an empty
                        price slot just looks like a failed lookup. */}
                    {amount ? (
                      <span className="price-lead">
                        <span className="price-amount">{amount}</span>
                        <span className="price-retailer">
                          {sourceName(p.retailer)}
                          {isBest && (
                            <span className="price-best-flag">Cheapest</span>
                          )}
                        </span>
                      </span>
                    ) : (
                      <span className="price-lead">
                        <span className="price-store">
                          {sourceName(p.retailer)}
                        </span>
                        <span className="price-retailer">
                          Search results for this model
                        </span>
                      </span>
                    )}
                    <a
                      className={amount ? "btn btn-solid" : "btn"}
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {amount ? "Buy" : "Check price"}
                    </a>
                  </li>
                );
              })}
            </ul>
            <p className="meta" style={{ marginTop: "0.75rem" }}>
              Checked {latest!.checkedAt.toLocaleString("en-US")}
              {!hasRealPrices &&
                " — set SERPAPI_KEY to show live prices instead of retailer links."}
            </p>
          </>
        )}
      </section>

      <section className="section">
        <h2>Manage</h2>
        <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem", flexWrap: "wrap" }}>
          <form action={toggleRetired}>
            <input type="hidden" name="shoeId" value={shoe.id} />
            <button className="btn" type="submit">
              {shoe.retiredAt ? "Put back in service" : "Retire this pair"}
            </button>
          </form>
          <form action={deleteShoe}>
            <input type="hidden" name="shoeId" value={shoe.id} />
            <button className="btn" type="submit">
              Delete shoe and its runs
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
