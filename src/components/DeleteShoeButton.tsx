"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { deleteShoe } from "@/app/actions";

function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn-danger" type="submit" disabled={pending}>
      {pending ? "Deleting…" : "Yes, delete permanently"}
    </button>
  );
}

/**
 * Deleting a pair, behind a confirmation step.
 *
 * Two clicks rather than a native confirm() dialog: the browser's is
 * suppressible, unstyled, and cannot name what is actually about to go. Here
 * the second step spells out the run count, because "delete shoe" understates
 * it — the runs, reviews, price history and photo all go with it, and none of
 * it is recoverable.
 */
export function DeleteShoeButton({
  shoeId,
  runCount,
}: {
  shoeId: string;
  runCount: number;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        className="btn btn-danger"
        type="button"
        onClick={() => setConfirming(true)}
      >
        Delete this pair
      </button>
    );
  }

  return (
    <div className="danger-zone">
      <p className="danger-zone-text">
        This deletes the pair
        {runCount > 0 && (
          <>
            {" "}
            and {runCount} logged {runCount === 1 ? "run" : "runs"}
          </>
        )}
        , along with its reviews, price history and photo.{" "}
        <strong>It cannot be undone.</strong>
      </p>
      <div className="danger-zone-actions">
        <form action={deleteShoe}>
          <input type="hidden" name="shoeId" value={shoeId} />
          <ConfirmButton />
        </form>
        <button
          className="btn"
          type="button"
          onClick={() => setConfirming(false)}
        >
          Keep it
        </button>
      </div>
    </div>
  );
}
