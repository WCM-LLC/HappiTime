/** A spade pip. Fills with currentColor so it takes the color of its parent. */
export function Spade({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`spade ${className}`}
      viewBox="0 0 100 110"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M50 2C50 2 8 42 8 66c0 14 11 23 23 23 8 0 14-3 18-9-1 11-6 19-14 24h30c-8-5-13-13-14-24 4 6 10 9 18 9 12 0 23-9 23-23C92 42 50 2 50 2z"
      />
    </svg>
  );
}
