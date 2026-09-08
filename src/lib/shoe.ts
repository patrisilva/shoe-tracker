import { type Unit, unitLabel } from "@/lib/units";

/**
 * Last-resort floor if a row somehow carries a non-positive lifespan. Matches
 * the column default in schema.prisma; the add-shoe action rejects anything
 * that would land here, so it only exists to keep the division safe.
 */
const LIFESPAN_FALLBACK = 400;

export type WearState = "fresh" | "watch" | "worn" | "over";

export type ShoeDistance = {
  distance: number;
  lifespan: number;
  remaining: number;
  fraction: number;
  state: WearState;
};

export function wearState(fraction: number): WearState {
  if (fraction >= 1) return "over";
  if (fraction >= 0.85) return "worn";
  if (fraction >= 0.6) return "watch";
  return "fresh";
}

/**
 * Unit-agnostic: both arguments are already in the account's unit, so this is
 * the same arithmetic whether the numbers are miles or kilometres.
 */
export function computeDistance(
  startingDistance: number,
  loggedDistance: number,
  lifespanDistance: number
): ShoeDistance {
  const distance = round1(startingDistance + loggedDistance);
  const lifespan = lifespanDistance > 0 ? lifespanDistance : LIFESPAN_FALLBACK;
  const fraction = distance / lifespan;
  return {
    distance,
    lifespan,
    remaining: round1(Math.max(lifespan - distance, 0)),
    fraction,
    state: wearState(fraction),
  };
}

/** Plain-language status line. Empty strings are never shown to the user. */
export function wearMessage(m: ShoeDistance, unit: Unit): string {
  const u = unitLabel(unit);
  switch (m.state) {
    case "over":
      return `${round1(m.distance - m.lifespan)} ${u} past the ${m.lifespan} ${u} mark`;
    case "worn":
      return `${m.remaining} ${u} left — start shopping`;
    default:
      return `${m.remaining} ${u} left`;
  }
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function formatDistance(n: number): string {
  return round1(n).toLocaleString("en-US", { maximumFractionDigits: 1 });
}

/**
 * Normalises a calendar date to the UTC midnight instant used to store it.
 *
 * `ranOn` and `purchasedOn` are days off a calendar, not moments in time, so
 * they are pinned to UTC midnight on the way in and read back in UTC on the way
 * out. Anything else shifts the day for every timezone west of UTC.
 *
 * Accepts the `YYYY-MM-DD` string an <input type="date"> submits, or a Date
 * whose local calendar day should be used. Returns null on unparseable input.
 */
export function calendarDate(value: string | Date): Date | null {
  if (typeof value !== "string") {
    return new Date(
      Date.UTC(value.getFullYear(), value.getMonth(), value.getDate())
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Renders in UTC so a stored calendar date reads back as the day picked. */
export function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function shoeName(s: { brand: string; model: string }): string {
  return `${s.brand} ${s.model}`;
}
