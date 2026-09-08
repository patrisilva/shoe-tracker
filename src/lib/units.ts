/**
 * Distance units.
 *
 * One unit per account, stored on `User.unit`. Every distance in the database —
 * `Shoe.startingDistance`, `Shoe.lifespanDistance`, `Run.distance` — is held in
 * that unit, so nothing has to be converted on the way out. Switching the unit
 * converts the account's existing rows once (see `setUnit` in app/actions.ts),
 * which keeps the arithmetic in shoe.ts free of any unit awareness.
 */

export type Unit = "MI" | "KM";

export const UNITS: Unit[] = ["MI", "KM"];

const MILES_PER_KM = 0.621371;

/** Short label that follows a number: "12.4 mi". */
export function unitLabel(unit: Unit): string {
  return unit === "KM" ? "km" : "mi";
}

/** Long label for form fields and settings copy. */
export function unitName(unit: Unit): string {
  return unit === "KM" ? "kilometres" : "miles";
}

/** Round retirement threshold for a fresh shoe, per unit. */
export function defaultLifespan(unit: Unit): number {
  return unit === "KM" ? 800 : 400;
}

/** Rejects anything that is not a known unit, so form input can be trusted. */
export function parseUnit(value: unknown): Unit | null {
  return value === "MI" || value === "KM" ? value : null;
}

/**
 * Converts a stored distance between units. Rounded to one decimal to match the
 * precision the app displays, so a round trip stays visually stable.
 */
export function convert(value: number, from: Unit, to: Unit): number {
  if (from === to) return value;
  const converted = to === "KM" ? value / MILES_PER_KM : value * MILES_PER_KM;
  return Math.round(converted * 10) / 10;
}
