import Link from "next/link";

/**
 * The Shoe Rack lockup: an outsole, then the name.
 *
 * The mark is the underside of a running shoe — the part that actually wears
 * out, which is the one thing this app exists to measure. Flex grooves are cut
 * clean through rather than drawn as lines, so nothing silts up at masthead
 * size; the whole sole leans into the direction of travel.
 *
 * The silhouette came out of a width profile sampled down the sole and
 * smoothed, which is why the path has no round numbers in it. Proportions that
 * matter if it is ever redrawn: widest at the ball of the foot, a shallow
 * waist (a real outsole has a shank filling it, so it never pinches to a
 * footprint's hourglass), and a heel about 78% of the forefoot width.
 *
 * IDs are fixed rather than generated. One lockup renders per page, and a
 * second would reference an identical gradient anyway — not worth making this
 * a client component for.
 */
function Sole() {
  return (
    <svg className="logo-mark" viewBox="0 0 24 38" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="logoInk" x1="0" y1="0" x2="0.7" y2="1">
          <stop offset="0" style={{ stopColor: "var(--flame-lift)" }} />
          <stop offset="0.55" style={{ stopColor: "var(--flame)" }} />
          <stop offset="1" style={{ stopColor: "var(--flame-deep)" }} />
        </linearGradient>
        {/* White keeps, black cuts. The bars overhang the sole on both sides
            so each one reads as a groove straight through it. Three across the
            forefoot, two across the heel — the waist stays solid, which is
            where a real shoe's shank is. */}
        <mask
          id="logoGrooves"
          maskUnits="userSpaceOnUse"
          x="-8"
          y="-3"
          width="40"
          height="44"
        >
          <rect x="-8" y="-3" width="40" height="44" fill="#fff" />
          <g fill="#000" transform="rotate(-4 12 19)">
            <rect x="-16" y="4.6" width="56" height="1.6" />
            <rect x="-16" y="9.2" width="56" height="1.6" />
            <rect x="-16" y="13.8" width="56" height="1.6" />
            <rect x="-16" y="27.2" width="56" height="1.6" />
            <rect x="-16" y="31.6" width="56" height="1.6" />
          </g>
        </mask>
      </defs>
      <path
        mask="url(#logoGrooves)"
        fill="url(#logoInk)"
        d="M12 0.55C12.53 0.61 14.37 0.69 15.2 0.9C16.03 1.11 16.35 1.37 17 1.8C17.65
           2.23 18.52 2.8 19.1 3.5C19.68 4.2 20.15 5.08 20.5 6C20.85 6.92 21.08 8 21.2
           9C21.32 10 21.33 10.92 21.2 12C21.07 13.08 20.77 14.25 20.4 15.5C20.03 16.75
           19.43 18.17 19 19.5C18.57 20.83 17.93 22.33 17.8 23.5C17.67 24.67 18.05 25.5
           18.2 26.5C18.35 27.5 18.63 28.58 18.7 29.5C18.77 30.42 18.73 31.22 18.6
           32C18.47 32.78 18.28 33.55 17.9 34.2C17.52 34.85 16.85 35.45 16.3 35.9C15.75
           36.35 15.33 36.67 14.6 36.9C13.87 37.13 12.8 37.25 11.9 37.25C11 37.25 9.95
           37.13 9.2 36.9C8.45 36.67 7.97 36.35 7.4 35.9C6.83 35.45 6.22 34.85 5.8
           34.2C5.38 33.55 5.05 32.78 4.9 32C4.75 31.22 4.73 30.42 4.9 29.5C5.07 28.58
           5.62 27.5 5.9 26.5C6.18 25.5 6.65 24.67 6.6 23.5C6.55 22.33 6.07 20.83 5.6
           19.5C5.13 18.17 4.3 16.75 3.8 15.5C3.3 14.25 2.85 13.08 2.6 12C2.35 10.92
           2.22 10 2.3 9C2.38 8 2.68 6.92 3.1 6C3.52 5.08 4.15 4.2 4.8 3.5C5.45 2.8
           6.33 2.23 7 1.8C7.67 1.37 7.97 1.11 8.8 0.9C9.63 0.69 11.47 0.61 12 0.55Z"
      />
    </svg>
  );
}

/**
 * Pass `href` on pages where the lockup should navigate (it becomes the link
 * itself, so the whole thing is one target); omit it on the landing page,
 * where there is nowhere to go.
 */
export function Logo({ href }: { href?: string }) {
  const inner = (
    <>
      <Sole />
      <span className="logo-type">Shoe Rack</span>
    </>
  );
  return href ? (
    <Link href={href} className="logo">
      {inner}
    </Link>
  ) : (
    <span className="logo">{inner}</span>
  );
}
