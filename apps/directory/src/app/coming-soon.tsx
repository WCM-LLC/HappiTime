"use client";

import { useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
);

export default function ComingSoon() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [showAppPopup, setShowAppPopup] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email) return;

    const { error: insertError } = await supabase
      .from("email_signups")
      .insert({ email, source: "coming_soon" });

    if (insertError) {
      if (insertError.code === "23505") {
        // Duplicate — they already signed up, just show success
        setSubmitted(true);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } else {
      setSubmitted(true);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-16 text-center bg-background">
      {/* Animated glow behind logo */}
      <div className="relative mb-10">
        <div className="absolute inset-0 blur-3xl opacity-20 bg-brand rounded-full scale-150" />
        <div className="relative">
          <h1 className="text-6xl sm:text-7xl font-extrabold tracking-tight text-foreground">
            Happi<span className="text-brand">Time</span>
          </h1>
        </div>
      </div>

      {/* Tagline */}
      <p className="text-xl sm:text-2xl text-muted max-w-xl leading-relaxed mb-2">
        Kansas City&apos;s Happy Hour Guide
      </p>
      <p className="text-lg text-muted-light max-w-md leading-relaxed mb-10">
        Browse deals by neighborhood. Save your favorites. Never miss a deal again.
      </p>

      {/* Android Coming Soon badge */}
      <div className="inline-flex items-center gap-2 rounded-full bg-brand-subtle px-5 py-2.5 mb-10">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-brand" />
        </span>
        <span className="text-sm font-semibold text-brand-text tracking-wide uppercase">
          HappiTime for Android Coming Soon
        </span>
      </div>

      {/* Email signup */}
      {!submitted ? (
        <form onSubmit={handleSubmit} className="w-full max-w-md mb-12">
          <p className="text-sm text-muted mb-4">
            Be the first to know when we launch. Get early access and exclusive deals.
          </p>
          <div className="flex gap-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              className="flex-1 rounded-full border border-border bg-surface px-5 py-3 text-foreground placeholder:text-muted-light focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand transition-all"
            />
            <button
              type="submit"
              className="rounded-full bg-brand px-6 py-3 text-white font-semibold hover:bg-brand-dark transition-colors whitespace-nowrap"
            >
              Notify Me
            </button>
          </div>
          {error && (
            <p className="text-sm text-error mt-3">{error}</p>
          )}
        </form>
      ) : (
        <div className="w-full max-w-md mb-12 rounded-2xl bg-brand-subtle p-6">
          <p className="text-brand-text font-semibold text-lg mb-1">
            You&apos;re on the list!
          </p>
          <p className="text-sm text-brand-text/80">
            We&apos;ll let you know as soon as HappiTime launches in Kansas City.
          </p>
        </div>
      )}

      {/* App store badges */}
      <div className="flex flex-col sm:flex-row items-center gap-4 mb-16">
        <a
          href="https://apps.apple.com/us/app/happitime/id6757933269"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-xl border border-border bg-surface px-5 py-3 hover:border-brand hover:shadow-md transition-all cursor-pointer"
        >
          <svg className="w-7 h-7 text-foreground" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.71 19.5C17.88 20.74 17 21.95 15.66 21.97C14.32 21.99 13.89 21.18 12.37 21.18C10.84 21.18 10.37 21.95 9.1 21.99C7.79 22.03 6.8 20.68 5.96 19.47C4.25 16.99 2.97 12.5 4.7 9.46C5.55 7.95 7.13 7 8.82 6.97C10.1 6.95 11.32 7.84 12.11 7.84C12.89 7.84 14.37 6.77 15.92 6.93C16.57 6.96 18.39 7.21 19.56 8.91C19.47 8.97 17.09 10.35 17.12 13.18C17.15 16.58 20.01 17.69 20.04 17.7C20.01 17.78 19.58 19.27 18.71 19.5ZM13 3.5C13.73 2.67 14.94 2.04 15.94 2C16.07 3.17 15.6 4.35 14.9 5.19C14.21 6.04 13.07 6.7 11.95 6.61C11.8 5.46 12.36 4.26 13 3.5Z" />
          </svg>
          <div className="text-left">
            <p className="text-[10px] text-muted leading-none">Download on the</p>
            <p className="text-sm font-semibold text-foreground leading-tight">App Store</p>
          </div>
        </a>
        <button
          onClick={() => setShowAppPopup(true)}
          className="flex items-center gap-3 rounded-xl border border-border bg-surface px-5 py-3 hover:border-brand hover:shadow-md transition-all cursor-pointer"
        >
          <svg className="w-7 h-7 text-foreground" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3.18 23.77L14.29 12.56L3.18 1.35C2.55 1.91 2.18 2.76 2.18 3.74V21.38C2.18 22.36 2.55 23.21 3.18 23.77ZM15.73 11.1L5.42 0.08L17.58 7.16L15.73 11.1ZM15.73 14.02L17.59 17.97L5.42 25.05L15.73 14.02ZM18.4 8L21.37 9.71C22.2 10.17 22.2 14.95 21.37 15.42L18.4 17.12L16.35 12.56L18.4 8Z" />
          </svg>
          <div className="text-left">
            <p className="text-[10px] text-muted leading-none">Get it on</p>
            <p className="text-sm font-semibold text-foreground leading-tight">Google Play</p>
          </div>
        </button>
      </div>

      {/* Android Coming Soon popup */}
      {showAppPopup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setShowAppPopup(false)}
        >
          <div
            className="bg-surface rounded-2xl border border-border shadow-xl p-8 max-w-sm mx-4 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-14 h-14 rounded-full bg-brand-subtle flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">🚀</span>
            </div>
            <h3 className="text-xl font-bold text-foreground mb-2">HappiTime for Android Coming Soon</h3>
            <p className="text-sm text-muted leading-relaxed mb-6">
              HappiTime is launching on Google Play soon. Sign up above to be the first to know when it&apos;s available!
            </p>
            <button
              onClick={() => setShowAppPopup(false)}
              className="rounded-full bg-brand px-6 py-2.5 text-white text-sm font-semibold hover:bg-brand-dark transition-colors"
            >
              Got It
            </button>
          </div>
        </div>
      )}

      {/* What to expect */}
      <div className="w-full max-w-2xl grid grid-cols-1 sm:grid-cols-3 gap-6 mb-16">
        <div className="rounded-2xl border border-border bg-surface p-6">
          <div className="w-12 h-12 rounded-full bg-brand-subtle flex items-center justify-center mb-4 mx-auto">
            <span className="text-xl">📍</span>
          </div>
          <h3 className="font-bold text-foreground mb-2">Browse by Neighborhood</h3>
          <p className="text-sm text-muted leading-relaxed">
            Westport, P&amp;L, Crossroads, Plaza, and every KC neighborhood.
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-6">
          <div className="w-12 h-12 rounded-full bg-brand-subtle flex items-center justify-center mb-4 mx-auto">
            <span className="text-xl">🍹</span>
          </div>
          <h3 className="font-bold text-foreground mb-2">See Every Deal</h3>
          <p className="text-sm text-muted leading-relaxed">
            Drink specials, food deals, and menus — all in one place.
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-6">
          <div className="w-12 h-12 rounded-full bg-brand-subtle flex items-center justify-center mb-4 mx-auto">
            <span className="text-xl">⭐</span>
          </div>
          <h3 className="font-bold text-foreground mb-2">Save Favorites</h3>
          <p className="text-sm text-muted leading-relaxed">
            Build your go-to list and never miss happy hour again.
          </p>
        </div>
      </div>

      {/* Venue owner CTA */}
      <div className="w-full max-w-lg rounded-2xl border border-brand/30 bg-brand-subtle p-8 mb-12">
        <h3 className="text-lg font-bold text-foreground mb-2">
          Own a bar or restaurant?
        </h3>
        <p className="text-sm text-muted mb-4 leading-relaxed">
          Get your happy hour listed on HappiTime for free. Reach thousands of locals looking for their next spot.
        </p>
        <a
          href="mailto:admin@happitime.biz?subject=Venue%20Partnership%20—%20HappiTime"
          className="inline-block rounded-full bg-brand px-6 py-2.5 text-white text-sm font-semibold hover:bg-brand-dark transition-colors"
        >
          Get Listed
        </a>
      </div>

      {/* Social links */}
      <a
        href="https://www.instagram.com/happitime.biz/"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 text-sm text-muted hover:text-brand transition-colors mb-8"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
        </svg>
        @findhappitime
      </a>

      {/* Footer links */}
      <div className="flex gap-6 text-sm text-muted">
        <a href="/privacy/" className="hover:text-foreground transition-colors">Privacy</a>
        <a href="/terms/" className="hover:text-foreground transition-colors">Terms</a>
        <a href="mailto:admin@happitime.biz" className="hover:text-foreground transition-colors">Contact Us</a>
      </div>
      <p className="text-xs text-muted-light mt-4">&copy; {new Date().getFullYear()} HappiTime</p>
    </div>
  );
}
