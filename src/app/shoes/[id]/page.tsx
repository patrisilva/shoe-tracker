import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { DistanceRail } from "@/components/DistanceRail";
import { LogRunForm } from "@/components/LogRunForm";
import { AddReviewForm } from "@/components/AddReviewForm";
import { deleteRun, deleteShoe, removeReviewLink, toggleRetired } from "@/app/actions";
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
  const unit = user?.unit ?? "MI";
  const u = unitLabel(unit);

  const shoe = await prisma.shoe.findFirst({
    where: { id, userId: session.user.id },
    include: {
      runs: { orderBy: { ranOn: "desc" }, take: 50 },
      links: { orderBy: { position: "asc" } },
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
        <div className="rack-head">
          <h1 style={{ fontSize: "clamp(2rem,5vw,3rem)" }}>
            {shoe.brand} {shoe.model}
            {shoe.nickname && (
              <span className="shoe-nickname"> — {shoe.nickname}</span>
            )}
          </h1>
          <span className={`odometer state-${m.state}`}>
            {formatDistance(m.distance)}
            <small>
              of {m.lifespan} {u}
            </small>
          </span>
        </div>

        <DistanceRail distance={m} unit={unit} />

        <div className="rack-foot">
          <span className={`state-${m.state}`}>{wearMessage(m, unit)}</span>
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

      <section className="section">
        <h2>Reviews</h2>
        {reviews.length === 0 ? (
          <p className="empty">
            No reviews saved. Add one below and it shows up here.
          </p>
        ) : (
          <ul className="stack">
            {reviews.map((link) => (
              <li key={link.id}>
                <a href={link.url} target="_blank" rel="noopener noreferrer">
                  {link.title}
                </a>
                <span className="meta">
                  {sourceName(link.source)}
                  <form action={removeReviewLink} style={{ display: "inline" }}>
                    <input type="hidden" name="linkId" value={link.id} />
                    <button
                      className="btn btn-quiet"
                      type="submit"
                      style={{ marginLeft: "1rem" }}
                    >
                      Remove
                    </button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        )}
        <AddReviewForm
          shoeId={shoe.id}
          atLimit={reviews.length >= MAX_REVIEW_LINKS}
        />
      </section>

      <section className="section">
        <h2>Where to buy another pair</h2>
        {prices.length === 0 ? (
          <p className="empty">
            Prices refresh once a day. Nothing has been checked for this shoe yet.
          </p>
        ) : (
          <>
            <p className="meta" style={{ margin: "0.85rem 0 0" }}>
              Checked {latest!.checkedAt.toLocaleString("en-US")}
              {best && (
                <> — cheapest found is {formatPrice(best.priceCents, best.currency)}</>
              )}
            </p>
            <ul className="stack" style={{ marginTop: "0.5rem" }}>
              {prices.map((p) => (
                <li key={p.id}>
                  <a href={p.url} target="_blank" rel="noopener noreferrer">
                    {sourceName(p.retailer)}
                  </a>
                  <span className="meta">
                    {formatPrice(p.priceCents, p.currency) ?? "Check current price"}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="section">
        <h2>Run log</h2>
        {shoe.runs.length === 0 ? (
          <p className="empty">Nothing logged yet.</p>
        ) : (
          <ul className="stack">
            {shoe.runs.map((run) => (
              <li key={run.id}>
                <span>
                  <strong style={{ fontVariantNumeric: "tabular-nums" }}>
                    {formatDistance(run.distance)} {u}
                  </strong>
                  {run.notes && (
                    <span className="meta" style={{ marginLeft: "1rem" }}>
                      {run.notes}
                    </span>
                  )}
                </span>
                <span className="meta">
                  {formatDate(run.ranOn)}
                  <form action={deleteRun} style={{ display: "inline" }}>
                    <input type="hidden" name="runId" value={run.id} />
                    <button
                      className="btn btn-quiet"
                      type="submit"
                      style={{ marginLeft: "1rem" }}
                    >
                      Delete
                    </button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
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
