import type { Suit as SuitKind } from "./event";

const PATHS: Record<SuitKind, React.ReactNode> = {
  spade: (
    <path
      fill="currentColor"
      d="M50 2C50 2 8 42 8 66c0 14 11 23 23 23 8 0 14-3 18-9-1 11-6 19-14 24h30c-8-5-13-13-14-24 4 6 10 9 18 9 12 0 23-9 23-23C92 42 50 2 50 2z"
    />
  ),
  heart: (
    <path
      fill="currentColor"
      d="M50 104C22 80 4 60 4 36 4 19 17 6 32 6c8 0 14 4 18 10 4-6 10-10 18-10 15 0 28 13 28 30 0 24-18 44-46 68z"
    />
  ),
  diamond: <path fill="currentColor" d="M50 2 94 55 50 108 6 55z" />,
  club: (
    <>
      <circle fill="currentColor" cx="50" cy="29" r="23" />
      <circle fill="currentColor" cx="26" cy="62" r="23" />
      <circle fill="currentColor" cx="74" cy="62" r="23" />
      <path fill="currentColor" d="M43 48h14v18c0 14 5 26 13 36H30c8-10 13-22 13-36z" />
    </>
  ),
};

/** A suit pip. Fills with currentColor so it takes the color of its parent. */
export function Suit({ kind, className = "" }: { kind: SuitKind; className?: string }) {
  return (
    <svg className={`spade ${className}`} viewBox="0 0 100 110" aria-hidden="true" focusable="false">
      {PATHS[kind]}
    </svg>
  );
}

/** The spade pip used on the event card. */
export function Spade({ className = "" }: { className?: string }) {
  return <Suit kind="spade" className={className} />;
}
