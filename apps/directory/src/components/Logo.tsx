import Image from "next/image";

/**
 * The HappiTime wordmark.
 *
 * Single source of truth for the directory. Renders the brand asset at
 * /public/brand/happitime-wordmark.png (974×304, transparent): copper
 * letterforms with the white "iTi" on the copper disc. Supplied by J on
 * 2026-10-22 and canonical across web, directory, and the design-system
 * bundle. The earlier inline SVG <text> wordmark is retired — do not
 * re-inline it; the drift it caused is why this component exists.
 *
 * Size it with a Tailwind height class (`h-8`, `h-28 sm:h-36`); width follows.
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
    <Image
      src="/brand/happitime-wordmark.png"
      alt={decorative ? "" : "HappiTime"}
      width={974}
      height={304}
      priority
      aria-hidden={decorative ? true : undefined}
      className={`w-auto select-none ${className}`}
    />
  );
}

export default HappiTimeLogo;
