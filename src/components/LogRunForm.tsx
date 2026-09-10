"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { logRun, type ActionResult } from "@/app/actions";
import { unitLabel, type Unit } from "@/lib/units";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn-solid" type="submit" disabled={pending}>
      {pending ? "Logging…" : "Log run"}
    </button>
  );
}

export function LogRunForm({ shoeId, unit }: { shoeId: string; unit: Unit }) {
  // Collapsed by default: the log is what people come to read, and an always
  // open form was the largest thing on the page above it.
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  // The runner's own calendar day. toISOString() would give the UTC day, which
  // is already tomorrow for an evening run on this side of the Atlantic.
  const today = new Date().toLocaleDateString("en-CA");

  const [state, action] = useActionState<ActionResult, FormData>(
    async (prev, data) => {
      const result = await logRun(prev, data);
      if (!result.error) formRef.current?.reset();
      return result;
    },
    {}
  );

  if (!open) {
    return (
      <button
        className="btn btn-solid log-run-toggle"
        type="button"
        onClick={() => setOpen(true)}
      >
        Log a run
      </button>
    );
  }

  return (
    <form ref={formRef} action={action} className="form-panel log-run-panel">
      <input type="hidden" name="shoeId" value={shoeId} />
      <div className="field-row">
        <label className="field">
          <span>Distance ({unitLabel(unit)})</span>
          <input
            name="distance"
            type="number"
            min="0.1"
            step="any"
            placeholder={unit === "KM" ? "8.4" : "5.2"}
            required
          />
        </label>
        <label className="field">
          <span>Date</span>
          <input name="ranOn" type="date" defaultValue={today} />
        </label>
      </div>
      <label className="field">
        <span>Notes (optional)</span>
        <input name="notes" placeholder="Easy loop, felt flat on the forefoot" />
      </label>
      {state.error && <p className="error">{state.error}</p>}
      <div className="run-edit-actions">
        <Submit />
        <button className="btn" type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
