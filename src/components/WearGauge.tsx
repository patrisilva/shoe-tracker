import { type ShoeDistance, formatDistance, wearMessage } from "@/lib/shoe";
import { unitLabel, type Unit } from "@/lib/units";

/** Tick spacing that keeps a gauge at roughly 4–8 marks in either unit. */
function tickStep(unit: Unit): number {
  return unit === "KM" ? 200 : 100;
}

/**
 * The wear gauge: how much life is left in a pair.
 *
 * This is the one element allowed to be loud, because it is the whole product.
 * It was previously a 10px hairline with the mileage floating off to the right
 * as separate text — the most important number on the page, detached from the
 * thing that gave it meaning.
 *
 * Now the number is set inside the band at the fill edge, so distance covered
 * and distance remaining read as one object rather than three. Below 22% the
 * fill is too narrow to hold the figure, so it sits just outside instead.
 */
export function WearGauge({
  distance,
  unit,
  size = "row",
}: {
  distance: ShoeDistance;
  unit: Unit;
  size?: "row" | "hero";
}) {
  const pct = Math.min(distance.fraction, 1) * 100;
  const step = tickStep(unit);
  const u = unitLabel(unit);

  const ticks: number[] = [];
  for (let d = step; d < distance.lifespan; d += step) ticks.push(d);

  // Where the figure can sit without colliding with the remaining label.
  //  - under 22%: the fill is too narrow to hold it, so it sits just outside
  //  - 22–62%:    it rides the fill edge, pointing at where the wear ends
  //  - over 62%:  edge-riding would run into the remaining label at the right
  //               end, so it anchors to the left of the band instead
  const place = pct < 22 ? "outside" : pct > 62 ? "left" : "edge";
  // Past this the fill has reached the right-hand label, so it needs to be
  // set on the fill colour rather than on the grey track.
  const remainingOnFill = pct > 78;

  return (
    <div className={`gauge gauge-${size}`}>
      <div
        className="gauge-track"
        role="img"
        aria-label={`${distance.distance} of ${distance.lifespan} ${u} used`}
      >
        <div
          className={`gauge-fill bg-${distance.state}`}
          style={{ "--pct": `${pct}%` } as React.CSSProperties}
        />
        {ticks.map((d) => (
          <span
            key={d}
            className="gauge-tick"
            style={{ left: `${(d / distance.lifespan) * 100}%` }}
          />
        ))}

        <span
          className={`gauge-reading is-${place}`}
          style={{ "--pct": `${pct}%` } as React.CSSProperties}
        >
          <span className="num">{formatDistance(distance.distance)}</span>
          <small>{u}</small>
        </span>

        {/* wearMessage rather than a local string: it already handles the
            over-the-line case and adds the "start shopping" nudge exactly when
            that is the useful thing to say. */}
        <span
          className={`gauge-remaining${
            remainingOnFill ? " is-on-fill" : ` state-${distance.state}`
          }`}
        >
          {wearMessage(distance, unit)}
        </span>
      </div>

      <div className="gauge-scale" aria-hidden="true">
        <span>0</span>
        {ticks.map((d) => (
          <span key={d}>{d}</span>
        ))}
        <span>{distance.lifespan}</span>
      </div>
    </div>
  );
}
