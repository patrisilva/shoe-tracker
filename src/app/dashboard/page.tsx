import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/db";
import { DistanceRail } from "@/components/DistanceRail";
import { AddShoeForm } from "@/components/AddShoeForm";
import { UnitPicker } from "@/components/UnitPicker";
import {
  computeDistance,
  formatDate,
  formatDistance,
  wearMessage,
} from "@/lib/shoe";
import { unitLabel } from "@/lib/units";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { unit: true },
  });
  const unit = user?.unit ?? "MI";
  const u = unitLabel(unit);

  const shoes = await prisma.shoe.findMany({
    where: { userId: session.user.id },
    orderBy: [{ retiredAt: "asc" }, { createdAt: "desc" }],
    include: {
      runs: { orderBy: { ranOn: "desc" }, take: 1 },
      _count: { select: { runs: true } },
    },
  });

  const totals = await prisma.run.groupBy({
    by: ["shoeId"],
    where: { userId: session.user.id },
    _sum: { distance: true },
  });
  const loggedByShoe = new Map(
    totals.map((t) => [t.shoeId, t._sum.distance ?? 0])
  );

  const inService = shoes.filter((s) => !s.retiredAt);
  const retired = shoes.filter((s) => s.retiredAt);

  return (
    <main className="shell">
      <header className="masthead">
        <Link href="/dashboard" className="wordmark">
          Shoe Rack
        </Link>
        <div className="masthead-side">
          <UnitPicker unit={unit} />
          <span>{session.user.name ?? session.user.email}</span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button className="btn btn-quiet" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </header>

      {inService.length === 0 ? (
        <div className="empty">
          <h1 style={{ fontSize: "2.25rem", marginBottom: "0.75rem" }}>
            Nothing on the rack yet.
          </h1>
          <p>
            Add your first pair below. If it already has miles on it, enter them
            as the starting mileage and the count picks up from there.
          </p>
        </div>
      ) : (
        <ul className="rack">
          {inService.map((shoe) => {
            const m = computeDistance(
              shoe.startingDistance,
              loggedByShoe.get(shoe.id) ?? 0,
              shoe.lifespanDistance
            );
            const last = shoe.runs[0];
            return (
              <li key={shoe.id} className="rack-item">
                <div className="rack-head">
                  <Link href={`/shoes/${shoe.id}`} className="shoe-title">
                    {shoe.brand} {shoe.model}
                    {shoe.nickname && (
                      <span className="shoe-nickname"> — {shoe.nickname}</span>
                    )}
                  </Link>
                  <span className={`odometer state-${m.state}`}>
                    {formatDistance(m.distance)}
                    <small>{u}</small>
                  </span>
                </div>

                <DistanceRail distance={m} unit={unit} />

                <div className="rack-foot">
                  <span className={`state-${m.state}`}>
                    {wearMessage(m, unit)}
                  </span>
                  <span>
                    <span>
                      {last ? (
                        <>
                          Last run {formatDistance(last.distance)} {u} on{" "}
                          {formatDate(last.ranOn)}
                        </>
                      ) : (
                        "No runs logged"
                      )}
                    </span>
                    <span>
                      <Link href={`/shoes/${shoe.id}`}>Log a run</Link>
                    </span>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <section className="section">
        <h2>Add a shoe</h2>
        <div style={{ marginTop: "1.5rem" }}>
          <AddShoeForm unit={unit} />
        </div>
      </section>

      {retired.length > 0 && (
        <section className="section">
          <h2>Retired</h2>
          <ul className="stack">
            {retired.map((shoe) => {
              const m = computeDistance(
                shoe.startingDistance,
                loggedByShoe.get(shoe.id) ?? 0,
                shoe.lifespanDistance
              );
              return (
                <li key={shoe.id}>
                  <Link href={`/shoes/${shoe.id}`}>
                    {shoe.brand} {shoe.model}
                  </Link>
                  <span className="meta">
                    {formatDistance(m.distance)} {u} over {shoe._count.runs} runs
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
