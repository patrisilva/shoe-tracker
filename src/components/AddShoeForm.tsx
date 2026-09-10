"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { addShoe, type ActionResult } from "@/app/actions";
import { PhotoField } from "@/components/PhotoField";
import { defaultLifespan, unitLabel, type Unit } from "@/lib/units";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn-solid" type="submit" disabled={pending}>
      {pending ? "Saving…" : label}
    </button>
  );
}

export function AddShoeForm({ unit }: { unit: Unit }) {
  // Same reasoning as the run form: adding a pair is occasional, so it should
  // not occupy as much of the page as the rack itself.
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionResult, FormData>(addShoe, {});

  if (!open) {
    return (
      <button className="btn btn-solid" type="button" onClick={() => setOpen(true)}>
        Add a pair
      </button>
    );
  }

  return (
    <form action={action} className="form-panel">
      <div className="field-row">
        <label className="field">
          <span>Brand</span>
          <input name="brand" placeholder="Brooks" required autoComplete="off" />
        </label>
        <label className="field">
          <span>Model</span>
          <input name="model" placeholder="Ghost 16" required autoComplete="off" />
        </label>
      </div>

      <label className="field">
        <span>Nickname (optional)</span>
        <input name="nickname" placeholder="Daily blues" autoComplete="off" />
      </label>

      <PhotoField />

      <div className="field-row">
        <label className="field">
          <span>Already on them ({unitLabel(unit)})</span>
          {/* step="any" on purpose: a numeric step builds a validity grid off
              min, so step="10" from min="1" rejects a round 400. The columns
              are Float and addShoe validates the range server-side. */}
          <input
            name="startingDistance"
            type="number"
            min="0"
            step="any"
            defaultValue="0"
          />
        </label>
        <label className="field">
          <span>Replace at ({unitLabel(unit)})</span>
          <input
            name="lifespanDistance"
            type="number"
            min="1"
            step="any"
            defaultValue={defaultLifespan(unit)}
          />
        </label>
        <label className="field">
          <span>Bought on (optional)</span>
          <input name="purchasedOn" type="date" />
        </label>
      </div>

      {state.error && <p className="error">{state.error}</p>}
      <div className="run-edit-actions">
        <Submit label="Add to rack" />
        <button className="btn" type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
