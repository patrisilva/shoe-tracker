/**
 * A shoe's photo, or a drawing when there isn't one.
 *
 * The fallback is a side-profile running shoe rather than a camera icon or a
 * grey box: the rack should still look like a rack of shoes before anyone has
 * uploaded anything, and a literal placeholder icon would just read as missing.
 */
export function ShoeDrawing({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 120 64"
      role="img"
      aria-label="Running shoe"
    >
      {/* Midsole */}
      <path
        d="M6 46c0-4 2-6 6-7l18-3 12-9 10 1 6-5 14 3c10 2 18 5 24 9 5 3 8 6 8 10 0 3-2 5-6 5H14c-5 0-8-2-8-4Z"
        fill="currentColor"
        opacity="0.16"
      />
      {/* Outsole */}
      <path
        d="M6 47c0 4 3 7 8 7h84c4 0 6-2 6-5 0-2-1-3-2-4H6Z"
        fill="currentColor"
        opacity="0.34"
      />
      {/* Upper */}
      <path
        d="M30 36l12-9 10 1 6-5 14 3c9 2 17 5 23 9H31Z"
        fill="currentColor"
        opacity="0.24"
      />
      {/* Laces */}
      <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" opacity="0.5">
        <path d="M48 30l7 4M55 26l7 4M62 22l7 4" />
      </g>
      {/* Heel counter */}
      <path
        d="M98 41c4 1 6 3 6 6"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
        opacity="0.45"
      />
    </svg>
  );
}

export function ShoePhoto({
  shoeId,
  hasPhoto,
  className,
}: {
  shoeId: string;
  hasPhoto: boolean;
  className?: string;
}) {
  if (!hasPhoto) {
    return (
      <span className={`shoe-photo is-drawing ${className ?? ""}`}>
        <ShoeDrawing />
      </span>
    );
  }
  return (
    <span className={`shoe-photo ${className ?? ""}`}>
      {/* Served from our own route with an ownership check, so next/image's
          remote loader config would add nothing here. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/shoes/${shoeId}/image`} alt="" loading="lazy" />
    </span>
  );
}
