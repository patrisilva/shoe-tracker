"use client";

import { useRef, useState } from "react";
import { ShoeDrawing } from "@/components/ShoePhoto";

/** Longest edge after downscaling. Plenty for a card, small enough to store. */
const MAX_EDGE = 1000;
const JPEG_QUALITY = 0.82;

/**
 * Downscales in the browser before upload.
 *
 * This is what keeps the server free of a native image dependency: no sharp to
 * compile on Railway, and a phone photo arrives as ~100KB rather than 5MB,
 * comfortably under the 1MB server-action body limit.
 */
async function downscale(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
  );
  return blob ?? file;
}

/**
 * Photo picker with a live preview. Named `photo` so both addShoe and
 * setShoePhoto read it from the same form field.
 */
export function PhotoField({ label = "Photo" }: { label?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setNote("That file is not an image.");
      e.target.value = "";
      return;
    }

    setNote(null);
    try {
      const small = await downscale(file);
      // Swap the picked file for the downscaled one so the form posts that.
      const dt = new DataTransfer();
      dt.items.add(
        new File([small], "shoe.jpg", { type: small.type || "image/jpeg" })
      );
      if (inputRef.current) inputRef.current.files = dt.files;
      setPreview(URL.createObjectURL(small));
    } catch {
      // A codec the browser cannot decode: send the original and let the
      // server's size and magic-number checks decide.
      setPreview(URL.createObjectURL(file));
      setNote("Could not resize that image, uploading as-is.");
    }
  }

  return (
    <div className="photo-field">
      <span className="photo-preview">
        {preview ? (
          // Object URL for a file the user just picked; nothing for next/image
          // to optimise.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" />
        ) : (
          <ShoeDrawing />
        )}
      </span>

      <div>
        <span className="photo-label">{label}</span>
        <input
          ref={inputRef}
          type="file"
          name="photo"
          accept="image/jpeg,image/png,image/webp"
          onChange={onPick}
        />
        <p className="hint">
          {preview
            ? "Looks good. It uploads when you save."
            : "Optional. Without one, a drawing stands in."}
        </p>
        {note && <p className="hint">{note}</p>}
      </div>
    </div>
  );
}
