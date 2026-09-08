import { type ShoeDistance } from "@/lib/shoe";
import { unitLabel, type Unit } from "@/lib/units";

/** Tick spacing that keeps a rail at roughly 4–8 marks in either unit. */
function tickStep(unit: Unit): number {
  return unit === "KM" ? 200 : 100;
}

/**
 * A hairline track with regular ticks and a marker at the shoe's current
 * distance. Colour comes from wear state, so a glance down the rack reads as a
 * column of green, amber and brick.
 */
export function DistanceRail({
  distance,
  unit,
}: {
  distance: ShoeDistance;
  unit: Unit;
}) {
  const pct = Math.min(distance.fraction, 1) * 100;
  const step = tickStep(unit);
  const ticks: number[] = [];
  for (let d = step; d < distance.lifespan; d += step) ticks.push(d);

  return (
    <div>
      <div
        className="rail"
        role="img"
        aria-label={`${distance.distance} of ${distance.lifespan} ${unitLabel(
          unit
        )} used`}
      >
        <div
          className={`rail-fill bg-${distance.state}`}
          style={{ "--pct": `${pct}%` } as React.CSSProperties}
        />
        {ticks.map((d) => (
          <div
            key={d}
            className="rail-tick"
            style={{ left: `${(d / distance.lifespan) * 100}%` }}
          />
        ))}
      </div>
      <div className="rail-scale" aria-hidden="true">
        <span>0</span>
        {ticks.map((d) => (
          <span key={d}>{d}</span>
        ))}
        <span>{distance.lifespan}</span>
      </div>
    </div>
  );
}
