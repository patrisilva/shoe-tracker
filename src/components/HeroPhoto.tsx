"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { removeShoePhoto, setShoePhoto } from "@/app/actions";
import { PhotoField } from "@/components/PhotoField";
import { ShoePhoto } from "@/components/ShoePhoto";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn-solid" type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save photo"}
    </button>
  );
}

/**
 * The shoe's photo with editing attached to the image itself.
 *
 * The picker used to be its own section further down the page, which meant
 * scrolling away from the thing being changed. Here the control sits on the
 * photo and the form only appears once asked for, so the default view stays
 * the photo and the title.
 */
export function HeroPhoto({
  shoeId,
  hasPhoto,
}: {
  shoeId: string;
  hasPhoto: boolean;
}) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <div className="hero-photo">
        <ShoePhoto shoeId={shoeId} hasPhoto={hasPhoto} className="is-hero" />
        <button
          className="hero-photo-edit"
          type="button"
          onClick={() => setEditing(true)}
        >
          {hasPhoto ? "Change photo" : "Add a photo"}
        </button>
      </div>
    );
  }

  return (
    <form action={setShoePhoto} className="hero-photo-form">
      <input type="hidden" name="shoeId" value={shoeId} />
      <PhotoField label={hasPhoto ? "Replace the photo" : "Add a photo"} />
      <div className="run-edit-actions">
        <SaveButton />
        <button className="btn" type="button" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
      {hasPhoto && (
        <button
          className="btn btn-quiet"
          type="submit"
          formAction={removeShoePhoto}
          style={{ marginTop: "0.5rem" }}
        >
          Remove photo
        </button>
      )}
    </form>
  );
}
