"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

type Tab = { id: string; label: string; panel: ReactNode };

/**
 * Tabs for /sponsored-events/. Both panels are server-rendered and stay visible
 * until this component hydrates, so crawlers and no-JS readers get all of it;
 * without JS the tabs are plain in-page links to each panel. Once hydrated, the
 * inactive panel is hidden and /sponsored-events/#coming-soon opens straight to
 * that tab. Keyboard: the WAI-ARIA tabs pattern (arrow keys, Home/End).
 */
export function EventTabs({ tabs }: { tabs: Tab[] }) {
  const [active, setActive] = useState(tabs[0].id);
  // False on the server and before hydration: nothing is hidden until the
  // tab handlers exist to show it again.
  const [ready, setReady] = useState(false);
  const buttons = useRef<(HTMLAnchorElement | null)[]>([]);

  useEffect(() => {
    const fromHash = () => {
      const id = window.location.hash.slice(1);
      if (tabs.some((t) => t.id === id)) setActive(id);
    };
    fromHash();
    setReady(true);
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [tabs]);

  const select = (i: number, focus = false) => {
    const id = tabs[i].id;
    setActive(id);
    window.history.replaceState(null, "", i === 0 ? window.location.pathname : `#${id}`);
    if (focus) buttons.current[i]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent, i: number) => {
    const last = tabs.length - 1;
    const next =
      e.key === "ArrowRight" ? (i === last ? 0 : i + 1)
      : e.key === "ArrowLeft" ? (i === 0 ? last : i - 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? last
      : null;
    if (next === null) return;
    e.preventDefault();
    select(next, true);
  };

  return (
    <>
      <div role="tablist" aria-label="Sponsored events" className="mb-8 flex gap-2 border-b border-border">
        {tabs.map((t, i) => {
          const selected = t.id === active;
          return (
            <a
              key={t.id}
              href={`#panel-${t.id}`}
              ref={(el) => {
                buttons.current[i] = el;
              }}
              id={`tab-${t.id}`}
              role="tab"
              aria-selected={selected}
              aria-controls={`panel-${t.id}`}
              tabIndex={ready ? (selected ? 0 : -1) : undefined}
              onClick={(e) => {
                e.preventDefault();
                select(i);
              }}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={`-mb-px border-b-2 px-4 py-3 text-[15px] font-bold transition-colors ${
                selected
                  ? "border-brand text-foreground"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {t.label}
            </a>
          );
        })}
      </div>
      {tabs.map((t) => (
        <div
          key={t.id}
          id={`panel-${t.id}`}
          role="tabpanel"
          aria-labelledby={`tab-${t.id}`}
          hidden={ready && t.id !== active}
          tabIndex={0}
        >
          {t.panel}
        </div>
      ))}
    </>
  );
}
