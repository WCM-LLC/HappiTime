'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { VenuePrefill } from '@/app/api/places/details/route';

type Suggestion = { placeId: string; mainText: string; secondaryText: string };

/**
 * Google Places autocomplete for venue creation. Debounced (300ms, min 3
 * chars), keyboard-navigable, and always offers an "Enter manually" escape
 * hatch (new venues, pop-ups, and stadium concourses aren't always in
 * Google). One session token spans typing + the final details call so
 * Google bills it as a single Autocomplete session.
 */
export default function VenueAddressAutocomplete({
  onResolve,
  onManual,
  initialQuery = '',
  placeholder = 'Search Google for the venue…',
}: {
  onResolve: (prefill: VenuePrefill) => void;
  onManual?: () => void;
  initialQuery?: string;
  placeholder?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const sessionTokenRef = useRef<string>('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const ensureSessionToken = () => {
    if (!sessionTokenRef.current) sessionTokenRef.current = crypto.randomUUID();
    return sessionTokenRef.current;
  };

  const search = useCallback(async (input: string) => {
    try {
      const res = await fetch('/api/places/autocomplete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input, sessionToken: ensureSessionToken() }),
      });
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      setSuggestions(data.suggestions ?? []);
      setOpen(true);
      setHighlight(-1);
    } catch {
      setErr('Search failed — you can still enter details manually.');
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => void search(q), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, search]);

  // Close the dropdown on outside click.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  async function pick(s: Suggestion) {
    setBusy(true);
    setErr('');
    setOpen(false);
    try {
      const res = await fetch('/api/places/details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placeId: s.placeId, sessionToken: ensureSessionToken() }),
      });
      if (!res.ok) throw new Error('Lookup failed');
      const data = await res.json();
      // Details call closes the billing session; next search starts a new one.
      sessionTokenRef.current = '';
      setQuery(`${s.mainText}${s.secondaryText ? `, ${s.secondaryText}` : ''}`);
      onResolve(data.prefill as VenuePrefill);
    } catch {
      setErr('Could not load place details — try again or enter manually.');
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    const max = suggestions.length; // index === suggestions.length is the manual row
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, max));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      if (highlight >= 0) {
        e.preventDefault();
        if (highlight < suggestions.length) void pick(suggestions[highlight]);
        else {
          setOpen(false);
          onManual?.();
        }
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        disabled={busy}
        aria-expanded={open}
        aria-autocomplete="list"
        role="combobox"
        className="w-full h-10 rounded-md border border-border bg-background text-body-sm px-3 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand disabled:opacity-60"
      />
      {busy && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-caption text-muted">Loading…</span>
      )}
      {err && <p className="text-caption text-error mt-1">{err}</p>}
      {open && (
        <ul
          role="listbox"
          className="absolute z-30 mt-1 w-full rounded-md border border-border bg-surface shadow-lg overflow-hidden"
        >
          {suggestions.map((s, i) => (
            <li
              key={s.placeId}
              role="option"
              aria-selected={highlight === i}
              onMouseDown={(e) => { e.preventDefault(); void pick(s); }}
              onMouseEnter={() => setHighlight(i)}
              className={`px-3 py-2 cursor-pointer text-body-sm ${highlight === i ? 'bg-brand-subtle' : ''}`}
            >
              <span className="font-medium text-foreground">{s.mainText}</span>
              {s.secondaryText && <span className="text-muted"> — {s.secondaryText}</span>}
            </li>
          ))}
          <li
            role="option"
            aria-selected={highlight === suggestions.length}
            onMouseDown={(e) => { e.preventDefault(); setOpen(false); onManual?.(); }}
            onMouseEnter={() => setHighlight(suggestions.length)}
            className={`px-3 py-2 cursor-pointer text-body-sm border-t border-border text-muted ${highlight === suggestions.length ? 'bg-brand-subtle' : ''}`}
          >
            Enter manually instead
          </li>
        </ul>
      )}
    </div>
  );
}
