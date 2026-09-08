"use client";

import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";
import { replaceReviewLink, type ActionResult } from "@/app/actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn" type="submit" disabled={pending}>
      {pending ? "Adding…" : "Add review"}
    </button>
  );
}

export function AddReviewForm({ shoeId, atLimit }: { shoeId: string; atLimit: boolean }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action] = useActionState<ActionResult, FormData>(
    async (prev, data) => {
      const result = await replaceReviewLink(prev, data);
      if (!result.error) formRef.current?.reset();
      return result;
    },
    {}
  );

  return (
    <form ref={formRef} action={action} style={{ marginTop: "1.25rem", maxWidth: "34rem" }}>
      <input type="hidden" name="shoeId" value={shoeId} />
      <div className="field-row">
        <label className="field">
          <span>Name</span>
          <input name="title" placeholder="Ghost 16 review on YouTube" required />
        </label>
        <label className="field">
          <span>Link</span>
          <input name="url" type="url" placeholder="https://" required />
        </label>
      </div>
      {atLimit && (
        <p className="meta" style={{ marginBottom: "0.75rem" }}>
          Three is the maximum, so this will replace the last one in the list.
        </p>
      )}
      {state.error && <p className="error">{state.error}</p>}
      <Submit />
    </form>
  );
}
