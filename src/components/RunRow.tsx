"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { deleteRun, editRun, type ActionResult } from "@/app/actions";
import { formatDistance } from "@/lib/shoe";
import { unitLabel, type Unit } from "@/lib/units";

export type RunRowData = {
  id: string;
  distance: number;
  ranOn: string; // YYYY-MM-DD, already normalised on the server
  ranOnLabel: string;
  notes: string | null;
};

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn-solid" type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save run"}
    </button>
  );
}

/**
 * One logged run, switchable between reading and editing in place.
 *
 * Editing inline rather than on its own page keeps the correction next to the
 * number being corrected — a run log is scanned, and a typo is usually spotted
 * while looking at the row above it.
 */
export function RunRow({ run, unit }: { run: RunRowData; unit: Unit }) {
  const [editing, setEditing] = useState(false);
  const [state, action] = useActionState<ActionResult, FormData>(
    async (prev, data) => {
      const result = await editRun(prev, data);
      if (!result.error) setEditing(false);
      return result;
    },
    {}
  );

  if (!editing) {
    return (
      <li>
        <span>
          <strong className="num">
            {formatDistance(run.distance)} {unitLabel(unit)}
          </strong>
          {run.notes && (
            <span className="meta" style={{ marginLeft: "1rem" }}>
              {run.notes}
            </span>
          )}
        </span>
        <span className="meta run-actions">
          {run.ranOnLabel}
          <button
            className="btn btn-quiet"
            type="button"
            onClick={() => setEditing(true)}
          >
            Edit
          </button>
          <form action={deleteRun}>
            <input type="hidden" name="runId" value={run.id} />
            <button className="btn btn-quiet" type="submit">
              Delete
            </button>
          </form>
        </span>
      </li>
    );
  }

  return (
    <li className="run-editing">
      <form action={action} style={{ width: "100%" }}>
        <input type="hidden" name="runId" value={run.id} />
        {state.error && <p className="error">{state.error}</p>}

        <div className="field-row">
          <label className="field">
            <span>Distance ({unitLabel(unit)})</span>
            <input
              name="distance"
              type="number"
              min="0.1"
              step="any"
              defaultValue={run.distance}
              required
            />
          </label>
          <label className="field">
            <span>Date</span>
            <input name="ranOn" type="date" defaultValue={run.ranOn} />
          </label>
        </div>

        <label className="field">
          <span>Notes</span>
          <input name="notes" defaultValue={run.notes ?? ""} />
        </label>

        <div className="run-edit-actions">
          <SaveButton />
          <button
            className="btn"
            type="button"
            onClick={() => setEditing(false)}
          >
            Cancel
          </button>
        </div>
      </form>
    </li>
  );
}
