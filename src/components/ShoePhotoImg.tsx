"use client";

import { useState } from "react";
import { ShoeDrawing } from "@/components/ShoePhoto";

/**
 * The photo, falling back to the drawing if it will not load.
 *
 * A stored blob can be undecodable — a truncated upload, or bytes that passed
 * the magic-number check but are not a whole image. Without this the card
 * shows the browser's broken-image glyph, which looks like the app is broken
 * rather than like a photo that needs replacing.
 */
export function ShoePhotoImg({ shoeId }: { shoeId: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) return <ShoeDrawing />;

  return (
    // Served from our own route behind an ownership check, so next/image's
    // remote loader config would add nothing.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/shoes/${shoeId}/image`}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
