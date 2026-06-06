'use client';

import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import Link from 'next/link';

/**
 * VenueDashboardShell — "Direction B (sidebar nav)" layout from the
 * HappiTime design handoff (Venue Dashboard.html).
 *
 * Two-pane layout: a fixed sub-bar on top, a persistent left "Manage" rail of
 * sections, and a single scrolling right pane. The nav never scrolls away, and
 * the active tab + per-tab scroll position are remembered across refresh/save —
 * so a server-action reload lands you exactly where you left off instead of at
 * the top. Save confirmation is handled by the app's existing sonner toast
 * (FlashMessage reads ?success= on mount).
 *
 * The shell is scope-agnostic: the org dashboard and the per-venue page both
 * render it, passing their own sub-bar content (`subBarLeft`/`subBarRight`) and
 * a `storeKey` that scopes the persisted tab/scroll memory. Because consumers
 * are server components, the sub-bar is passed as plain `ReactNode` (functions
 * can't cross the server→client boundary); the only interactive sub-bar affordance
 * the shell owns is the optional `addButton`, which switches tabs via internal state.
 */

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export type ShellTab = {
  id: string;
  label: string;
  content: ReactNode;
  /** Hide the tab entirely (e.g. role-gated). Defaults to shown. */
  show?: boolean;
};

// ── persistence hooks ────────────────────────────────────────────────────────
function usePersistedTab(key: string, def: string): [string, (t: string) => void] {
  const [tab, setTab] = useState(def);

  // Reconcile with the stored value after mount to avoid hydration mismatch.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`${key}:tab`);
      if (stored) setTab(stored);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const set = useCallback(
    (t: string) => {
      setTab(t);
      try {
        localStorage.setItem(`${key}:tab`, t);
      } catch {
        /* ignore */
      }
    },
    [key],
  );

  return [tab, set];
}

// Per-tab scroll memory. Restores on mount + whenever the tab changes; saves
// continuously as you scroll. This is what survives a save/refresh.
function useScrollMemory(
  key: string,
  tab: string,
): [React.RefObject<HTMLDivElement | null>, (e: React.UIEvent<HTMLDivElement>) => void] {
  const ref = useRef<HTMLDivElement | null>(null);

  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let v = 0;
    try {
      v = parseInt(localStorage.getItem(`${key}:scroll:${tab}`) || '0', 10) || 0;
    } catch {
      /* ignore */
    }
    el.scrollTop = v;
  }, [tab, key]);

  const onScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      try {
        localStorage.setItem(`${key}:scroll:${tab}`, String(e.currentTarget.scrollTop));
      } catch {
        /* ignore */
      }
    },
    [key, tab],
  );

  return [ref, onScroll];
}

// ── shared sub-bar building blocks (exported for org + venue sub-bars) ─────────
export function OrgMark({ name }: { name: string }) {
  return (
    <div className="w-9 h-9 rounded-[9px] bg-brand-subtle flex items-center justify-center shrink-0 select-none">
      <span className="text-[15px] font-extrabold text-brand-dark-alt">
        {name.charAt(0).toUpperCase()}
      </span>
    </div>
  );
}

export type CrumbItem = { label: string; href?: string };

export function ShellCrumb({ items }: { items: CrumbItem[] }) {
  return (
    <div className="flex items-center gap-1.5 text-[12.5px] text-muted min-w-0">
      {items.map((it, i) => (
        <Fragment key={`${it.label}-${i}`}>
          {i > 0 ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-muted-light shrink-0">
              <path d="m9 18 6-6-6-6" />
            </svg>
          ) : null}
          {it.href ? (
            <Link href={it.href} className="text-brand font-medium hover:underline shrink-0">
              {it.label}
            </Link>
          ) : (
            <span className="text-foreground font-medium truncate">{it.label}</span>
          )}
        </Fragment>
      ))}
    </div>
  );
}

// ── nav rail item ─────────────────────────────────────────────────────────────
function NavItem({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center w-full text-left gap-2 px-3 py-[9px] rounded-[7px] text-[13.5px] transition-colors duration-fast cursor-pointer ${
        active
          ? 'bg-brand-subtle text-brand-dark-alt font-semibold'
          : 'text-muted font-medium hover:bg-black/[0.035]'
      }`}
    >
      <span
        className={`w-[5px] h-[5px] rounded-full shrink-0 ${active ? 'bg-brand' : 'bg-transparent'}`}
      />
      {label}
    </button>
  );
}

export default function VenueDashboardShell({
  storeKey,
  tabs,
  banner,
  subBarLeft,
  subBarRight,
  addButton,
}: {
  /** Scopes the persisted active-tab + per-tab scroll memory (e.g. `hh-venue:<orgId>`). */
  storeKey: string;
  tabs: ShellTab[];
  /** Optional node shown above the active panel on every tab (e.g. error banner). */
  banner?: ReactNode;
  /** Left cluster of the pinned sub-bar (mark, breadcrumb, title, badges). */
  subBarLeft: ReactNode;
  /** Right cluster of the pinned sub-bar (page-level actions). Server-rendered. */
  subBarRight?: ReactNode;
  /** Optional interactive button that jumps to a tab (e.g. org "Add Venue"). */
  addButton?: { label: string; tabId: string };
}) {
  const visible = tabs.filter((t) => t.show !== false);
  const [tab, setTab] = usePersistedTab(storeKey, visible[0]?.id ?? '');
  const [scrollRef, onScroll] = useScrollMemory(storeKey, tab);

  // Fall back to the first visible tab if the persisted one is gone/hidden.
  const active = visible.find((t) => t.id === tab) ?? visible[0];

  return (
    <div
      className="flex flex-col overflow-hidden bg-background"
      style={{ height: 'calc(100dvh - 3.5rem)' }}
    >
      {/* ── pinned sub-bar ── */}
      <div className="flex-shrink-0 min-h-[58px] border-b border-border bg-surface flex items-center justify-between gap-3 px-5">
        {subBarLeft}
        {subBarRight || addButton ? (
          <div className="flex items-center gap-2 shrink-0">
            {subBarRight}
            {addButton ? (
              <button
                type="button"
                onClick={() => setTab(addButton.tabId)}
                className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-md bg-brand text-white text-body-sm font-medium hover:bg-brand-dark transition-colors cursor-pointer shrink-0"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                {addButton.label}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* ── body: rail + scrolling content ── */}
      <div className="flex-1 flex overflow-hidden">
        <nav className="w-[202px] shrink-0 border-r border-border bg-surface px-3 py-4 flex flex-col gap-0.5">
          <div className="text-[10.5px] font-bold text-muted-light tracking-[0.08em] uppercase px-3 pb-2">
            Manage
          </div>
          {visible.map((t) => (
            <NavItem
              key={t.id}
              label={t.label}
              active={active?.id === t.id}
              onClick={() => setTab(t.id)}
            />
          ))}
        </nav>

        <div ref={scrollRef} onScroll={onScroll} data-testid="dashboard-scroll" className="flex-1 overflow-y-auto">
          <div className="max-w-[760px] mx-auto px-7 pt-6 pb-16">
            {/* Keyed so React validates these consumer-owned nodes; keying content
                by tab id also resets the subtree cleanly on tab change. */}
            {banner ? <Fragment key="banner">{banner}</Fragment> : null}
            <Fragment key={active?.id ?? 'empty'}>{active?.content}</Fragment>
          </div>
        </div>
      </div>
    </div>
  );
}
