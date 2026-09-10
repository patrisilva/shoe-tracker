import { setUnit } from "@/app/actions";
import { UNITS, unitLabel, unitName, type Unit } from "@/lib/units";

/**
 * Account-wide unit switch, as a segmented control.
 *
 * It used to be the words "miles" and "kilometres" sitting in a row of other
 * masthead text, which read as prose rather than as something you could
 * operate. Two short segments in a track make it obvious that one of them is
 * currently selected and the other is a switch.
 *
 * Submitting converts every distance already stored, so the numbers on screen
 * keep their meaning instead of being relabelled.
 */
export function UnitPicker({ unit }: { unit: Unit }) {
  return (
    <form action={setUnit} className="unit-switch">
      {UNITS.map((u) => {
        const current = u === unit;
        return (
          <button
            key={u}
            type="submit"
            name="unit"
            value={u}
            className={`unit-seg${current ? " is-current" : ""}`}
            aria-pressed={current}
            // The label is two letters; the full word carries the meaning for
            // anyone who cannot see which segment is filled.
            aria-label={`Show distances in ${unitName(u)}`}
            disabled={current}
          >
            {unitLabel(u)}
          </button>
        );
      })}
    </form>
  );
}
