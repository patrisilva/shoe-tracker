"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { editShoe, type ActionResult } from "@/app/actions";
import { unitLabel, type Unit } from "@/lib/units";

function Save() {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn-solid" type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save changes"}
    </button>
  );
}

export type ShoeDetails = {
  id: string;
  brand: string;
  model: string;
  nickname: string | null;
  startingDistance: number;
  lifespanDistance: number;
  /** YYYY-MM-DD, or empty. Normalised on the server. */
  purchasedOn: string;
};

/**
 * Correcting a pair's details.
 *
 * Collapsed by default and grouped with the other management actions, since
 * this is a fix-a-mistake path rather than something done routinely.
 */
export function EditShoeForm({
  shoe,
  unit,
}: {
  shoe: ShoeDetails;
  unit: Unit;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionResult, FormData>(
    async (prev, data) => {
      const result = await editShoe(prev, data);
      if (!result.error) setOpen(false);
      return result;
    },
    {}
  );

  if (!open) {
    return (
      <button className="btn" type="button" onClick={() => setOpen(true)}>
        Edit details
      </button>
    );
  }

  const u = unitLabel(unit);

  return (
    <form action={action} className="form-panel" style={{ width: "100%" }}>
      <input type="hidden" name="shoeId" value={shoe.id} />
      {state.error && <p className="error">{state.error}</p>}

      <div className="field-row">
        <label className="field">
          <span>Brand</span>
          <input name="brand" defaultValue={shoe.brand} required autoComplete="off" />
        </label>
        <label className="field">
          <span>Model</span>
          <input name="model" defaultValue={shoe.model} required autoComplete="off" />
        </label>
      </div>

      <label className="field">
        <span>Nickname (optional)</span>
        <input name="nickname" defaultValue={shoe.nickname ?? ""} autoComplete="off" />
      </label>

      <div className="field-row">
        <label className="field">
          <span>Already on them ({u})</span>
          {/* step="any" for the same reason as the add form: a step grid
              built off min rejected a round 400. */}
          <input
            name="startingDistance"
            type="number"
            min="0"
            step="any"
            defaultValue={shoe.startingDistance}
          />
        </label>
        <label className="field">
          <span>Replace at ({u})</span>
          <input
            name="lifespanDistance"
            type="number"
            min="1"
            step="any"
            defaultValue={shoe.lifespanDistance}
          />
        </label>
        <label className="field">
          <span>Bought on (optional)</span>
          <input name="purchasedOn" type="date" defaultValue={shoe.purchasedOn} />
        </label>
      </div>

      <div className="run-edit-actions">
        <Save />
        <button className="btn" type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
