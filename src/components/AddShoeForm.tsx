"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { addShoe, type ActionResult } from "@/app/actions";
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
  const [state, action] = useActionState<ActionResult, FormData>(addShoe, {});

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
      <Submit label="Add to rack" />
    </form>
  );
}
