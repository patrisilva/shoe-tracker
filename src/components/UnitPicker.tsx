import { setUnit } from "@/app/actions";
import { UNITS, unitName, type Unit } from "@/lib/units";

/**
 * Account-wide unit switch. Submitting converts every distance already stored,
 * so the numbers on screen keep their real meaning instead of being relabelled.
 */
export function UnitPicker({ unit }: { unit: Unit }) {
  return (
    <form action={setUnit} className="unit-picker">
      <span className="meta">Distances in</span>
      {UNITS.map((u) => (
        <button
          key={u}
          type="submit"
          name="unit"
          value={u}
          className={`btn btn-quiet${u === unit ? " is-current" : ""}`}
          aria-current={u === unit}
        >
          {unitName(u)}
        </button>
      ))}
    </form>
  );
}
