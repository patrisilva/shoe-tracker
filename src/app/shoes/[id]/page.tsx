import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { DistanceRail } from "@/components/DistanceRail";
import { LogRunForm } from "@/components/LogRunForm";
import { ReviewsSection } from "@/components/ReviewsSection";
import { RunRow } from "@/components/RunRow";
import { HeroPhoto } from "@/components/HeroPhoto";
import { DeleteShoeButton } from "@/components/DeleteShoeButton";
import { toggleRetired } from "@/app/actions";
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
      // runs above is capped at 50, so the delete warning needs a real count.
      _count: { select: { runs: true } },
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

  // Everything else worth clicking, cheapest first, minus the winner. Two is
  // enough to sanity-check the best price without turning this into a list.
  const alternatives = [...prices]
    .filter((p) => p.id !== best?.id)
    .sort((a, b) => (a.priceCents ?? Infinity) - (b.priceCents ?? Infinity))
    .slice(0, 2);

  // Lowest ever recorded for this shoe. Snapshots are never deleted, so this
  // is free history — and it is the number that says whether today is a good
  // day to buy or a week to wait.
  const lowestEver = await prisma.priceSnapshot.aggregate({
    where: { shoeId: shoe.id, priceCents: { not: null } },
    _min: { priceCents: true },
  });
  const floor = lowestEver._min.priceCents;

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
            {shoe._count.runs} {shoe._count.runs === 1 ? "run" : "runs"} logged
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

        {best ? (
          <>
            {/* One number, because the question is "what does it cost to
                replace these" and the answer is a single price. */}
            <div className="best-price">
              <div>
                <span className="best-price-label">Best price found</span>
                <span className="best-price-amount">
                  {formatPrice(best.priceCents, best.currency)}
                </span>
                <span className="best-price-where">
                  at {sourceName(best.retailer)}
                  {floor !== null && best.priceCents === floor && (
                    <span className="price-best-flag">Lowest yet</span>
                  )}
                </span>
              </div>
              <a
                className="btn btn-solid btn-lg"
                href={best.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Buy at {sourceName(best.retailer)}
              </a>
            </div>

            {alternatives.length > 0 && (
              <ul className="price-grid" style={{ marginTop: "1rem" }}>
                {alternatives.map((p) => (
                  <li key={p.id} className="price-row">
                    <span className="price-lead">
                      <span className="price-amount">
                        {formatPrice(p.priceCents, p.currency) ?? "—"}
                      </span>
                      <span className="price-retailer">
                        {sourceName(p.retailer)}
                      </span>
                    </span>
                    <a
                      className="btn"
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Buy
                    </a>
                  </li>
                ))}
              </ul>
            )}

            <p className="meta" style={{ marginTop: "0.85rem" }}>
              Checked daily. Last checked{" "}
              {latest!.checkedAt.toLocaleString("en-US")}
              {floor !== null && best.priceCents !== floor && (
                <>. Lowest seen {formatPrice(floor, best.currency)}</>
              )}
            </p>
          </>
        ) : (
          <>
            <p className="empty">
              No price found yet. The search runs once a day and the best price
              lands here when it does.
            </p>
            {prices.length > 0 && (
              <ul className="price-grid" style={{ marginTop: "1rem" }}>
                {prices.slice(0, 3).map((p) => (
                  <li key={p.id} className="price-row">
                    <span className="price-lead">
                      <span className="price-store">
                        {sourceName(p.retailer)}
                      </span>
                      <span className="price-retailer">
                        Search results for this model
                      </span>
                    </span>
                    <a
                      className="btn"
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Check price
                    </a>
                  </li>
                ))}
              </ul>
            )}
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
          <DeleteShoeButton shoeId={shoe.id} runCount={shoe._count.runs} />
        </div>
      </section>
    </main>
  );
}
