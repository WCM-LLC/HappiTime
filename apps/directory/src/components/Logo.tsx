/**
 * The HappiTime wordmark.
 *
 * Single source of truth for the directory. The split is `Happ` + `iTi` + `me`,
 * with the middle `iTi` in white so it reads out of the copper disc behind it —
 * the same split that is printed on the physical QR coasters and table tents
 * (see `packages/venue-qr/iti-mark.mjs`). Do not re-inline this SVG; the drift
 * it caused is why this component exists.
 *
 * The letterforms are SVG `<text>`, not outlined paths, so they depend on
 * Plus Jakarta Sans 800 being loaded. The site shell loads it via the Google
 * Fonts link in `app/layout.tsx`.
 *
 * Pass `decorative` where the wordmark is a picture of the product rather than
 * the site's own mark — inside the phone mockup on `/app`, for instance — so it
 * is hidden from assistive tech instead of announced a second time.
 */
export function HappiTimeLogo({
  className = "",
  decorative = false,
}: {
  className?: string;
  decorative?: boolean;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 439 148"
      className={className}
      {...(decorative
        ? { "aria-hidden": true as const }
        : { "aria-label": "HappiTime", role: "img" })}
    >
      <circle cx="260.2" cy="74.0" r="47.9" fill="#C8965A" />
      <text
        x="30"
        y="93.0"
        fontFamily="'Plus Jakarta Sans', sans-serif"
        fontWeight="800"
        fontSize="72"
        letterSpacing="-0.02em"
      >
        <tspan fill="#1A1A1A">Happ</tspan>
        <tspan fill="#FFFFFF">iTi</tspan>
        <tspan fill="#1A1A1A">me</tspan>
      </text>
    </svg>
  );
}

export default HappiTimeLogo;
