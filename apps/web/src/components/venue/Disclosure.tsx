'use client';

import { useState, type ReactNode } from 'react';

/**
 * Disclosure — a single accordion row used by the org dashboard's Happy Hours
 * tab. The `summary` is the always-visible, clickable trigger; `children` (the
 * window editor, rendered server-side) is revealed only when expanded. Keeping
 * this tiny and generic lets the server component own all the forms and bound
 * server actions while React owns just the open/close state.
 */
export default function Disclosure({
  summary,
  children,
  defaultOpen = false,
}: {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-lg border border-border bg-surface shadow-sm transition-shadow hover:shadow-md">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 p-5 text-left cursor-pointer"
      >
        <div className="min-w-0 flex-1">{summary}</div>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          className={`text-muted-light shrink-0 transition-transform duration-fast ${open ? 'rotate-90' : ''}`}
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
      </button>
      {open ? <div className="border-t border-border px-5 pb-5 pt-4">{children}</div> : null}
    </div>
  );
}
