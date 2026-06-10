'use client';

import { useEffect, useRef, useState } from 'react';

type Props = {
  /** 4-char code for today's service date. */
  initialCode: string;
  /** ISO timestamp when the code rotates (next 6 AM CT). */
  rotatesAt: string;
  /** Venue name to display. */
  venueName: string;
};

/**
 * Renders the check-in code large and auto-refreshes the page at the next
 * 6:00 AM CT rotation boundary. The parent server component passes only
 * { initialCode, rotatesAt, venueName } — the HMAC secret is never sent here.
 */
export function StaffCodeDisplay({ initialCode, rotatesAt, venueName }: Props) {
  const [code, setCode] = useState(initialCode);
  const [timeUntil, setTimeUntil] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const rotatesMs = new Date(rotatesAt).getTime();

    function tick() {
      const now = Date.now();
      const diff = rotatesMs - now;
      if (diff <= 0) {
        // Time to rotate — reload the page so the server component re-computes
        // the new code. We never re-derive the code client-side.
        window.location.reload();
        return;
      }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);
      setTimeUntil(
        h > 0
          ? `${h}h ${m.toString().padStart(2, '0')}m`
          : m > 0
            ? `${m}m ${s.toString().padStart(2, '0')}s`
            : `${s}s`,
      );
    }

    tick();
    const interval = setInterval(tick, 1_000);

    // Also schedule a single hard reload exactly at the rotation boundary.
    const msUntil = rotatesMs - Date.now();
    if (msUntil > 0) {
      timerRef.current = setTimeout(() => window.location.reload(), msUntil + 500);
    }

    return () => {
      clearInterval(interval);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [rotatesAt]);

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-6 py-12 select-none">
      {/* Venue name */}
      <p className="text-gray-400 text-sm font-medium tracking-widest uppercase mb-2">
        {venueName}
      </p>

      {/* Label */}
      <h1 className="text-white text-lg font-semibold mb-8">
        Today&apos;s Check-in Code
      </h1>

      {/* The code — rendered large for easy reading across a bar */}
      <div
        className="font-mono font-black text-white tracking-[0.25em] text-center"
        style={{ fontSize: 'clamp(4rem, 22vw, 10rem)', lineHeight: 1 }}
        aria-label={`Check-in code: ${code.split('').join(' ')}`}
      >
        {code}
      </div>

      {/* Rotation countdown */}
      <p className="text-gray-500 text-sm mt-10">
        Rotates in{' '}
        <span className="text-gray-300 tabular-nums">{timeUntil || '…'}</span>
      </p>

      {/* Instruction strip */}
      <div className="mt-12 max-w-xs text-center">
        <p className="text-gray-600 text-xs leading-relaxed">
          Show this code to guests who want to check in. The code changes every
          morning at 6&nbsp;AM.
        </p>
      </div>
    </div>
  );
}
