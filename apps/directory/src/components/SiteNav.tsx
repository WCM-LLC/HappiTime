"use client";

import { useState } from "react";
import { ItineraryBadge } from "@/components/ItineraryBadge";

export function SiteNav() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <>
      {/* Desktop nav */}
      <nav className="hidden md:flex items-center gap-4 text-sm font-medium text-muted">
        <a href="/kc/" className="hover:text-foreground transition-colors">
          Kansas City
        </a>
        <a href="/guides/" className="hover:text-foreground transition-colors">
          Guides
        </a>
        <ItineraryBadge />
        <a
          href="https://happitime-console.vercel.app/login"
          className="hover:text-foreground transition-colors"
        >
          Venue Login
        </a>
        <a
          href="/app/"
          className="rounded-full bg-brand px-4 py-2 text-white font-semibold text-xs hover:bg-brand-dark transition-colors"
        >
          Get the App
        </a>
      </nav>

      {/* Mobile: CTA always visible + hamburger */}
      <div className="flex md:hidden items-center gap-3">
        <a
          href="/app/"
          className="rounded-full bg-brand px-4 py-2 text-white font-semibold text-xs hover:bg-brand-dark transition-colors"
        >
          Get the App
        </a>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          className="w-11 h-11 flex items-center justify-center rounded-lg border border-border text-foreground"
        >
          {open ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 12h18M3 6h18M3 18h18" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <>
          {/* Backdrop — closes menu on outside tap */}
          <div className="fixed inset-0 z-40" onClick={close} />
          <nav className="absolute top-full left-0 right-0 z-50 bg-surface border-b border-border shadow-lg">
            <a
              href="/kc/"
              onClick={close}
              className="block px-6 py-4 text-sm font-medium text-foreground border-b border-border hover:bg-background transition-colors"
            >
              Kansas City
            </a>
            <a
              href="/guides/"
              onClick={close}
              className="block px-6 py-4 text-sm font-medium text-foreground border-b border-border hover:bg-background transition-colors"
            >
              Guides
            </a>
            <div className="px-6 py-4 border-b border-border">
              <ItineraryBadge />
            </div>
            <a
              href="https://happitime-console.vercel.app/login"
              onClick={close}
              className="block px-6 py-4 text-sm font-medium text-foreground hover:bg-background transition-colors"
            >
              Venue Login
            </a>
          </nav>
        </>
      )}
    </>
  );
}
