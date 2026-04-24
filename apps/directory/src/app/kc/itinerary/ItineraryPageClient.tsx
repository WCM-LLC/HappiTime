"use client";

import { useItinerary } from "@/components/ItineraryContext";
import { useState } from "react";

export function ItineraryPageClient() {
  const { items, remove, clear, count } = useItinerary();
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const text = items
      .map((item, i) => `${i + 1}. ${item.venueName}`)
      .join("\n");

    const shareText = `My HappiTime Itinerary 🍻\n\n${text}\n\nPlan yours at happitime.biz/kc/`;

    if (navigator.share) {
      try {
        await navigator.share({ title: "My HappiTime Itinerary", text: shareText });
      } catch {}
    } else {
      try {
        await navigator.clipboard.writeText(shareText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {}
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      {/* Breadcrumb */}
      <nav className="text-sm text-muted mb-6 flex items-center gap-1.5">
        <a href="/" className="hover:text-foreground transition-colors">
          HappiTime
        </a>
        <span className="text-muted-light">/</span>
        <a href="/kc/" className="hover:text-foreground transition-colors">
          Kansas City
        </a>
        <span className="text-muted-light">/</span>
        <span className="text-foreground font-medium">My Itinerary</span>
      </nav>

      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground mb-2">
            My Itinerary
          </h1>
          <p className="text-muted">
            {count === 0
              ? "You haven't added any venues yet. Browse happy hours and build your plan."
              : `${count} ${count === 1 ? "venue" : "venues"} on your list`}
          </p>
        </div>

        {count > 0 && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleShare}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-white text-sm font-semibold hover:bg-brand-dark transition-colors"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z"
                />
              </svg>
              {copied ? "Copied!" : "Share"}
            </button>
            <button
              onClick={clear}
              className="rounded-full border border-border px-4 py-2 text-sm font-medium text-muted hover:text-foreground hover:border-foreground transition-colors"
            >
              Clear All
            </button>
          </div>
        )}
      </div>

      {count === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-brand-subtle flex items-center justify-center">
            <svg
              className="w-8 h-8 text-brand"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
              />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-foreground mb-2">
            Plan Your Happy Hour Route
          </h2>
          <p className="text-sm text-muted mb-6 max-w-sm mx-auto">
            Browse venues and tap "Add to Itinerary" to build your personalized
            happy hour crawl.
          </p>
          <a
            href="/kc/"
            className="inline-flex items-center gap-2 rounded-full bg-brand px-6 py-2.5 text-white font-semibold text-sm hover:bg-brand-dark transition-colors"
          >
            Browse Venues
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
              />
            </svg>
          </a>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item, index) => (
            <div
              key={item.venueId}
              className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-5 hover:border-brand hover:shadow-sm transition-all"
            >
              {/* Order number */}
              <div className="w-8 h-8 rounded-full bg-brand-subtle flex items-center justify-center shrink-0">
                <span className="text-sm font-bold text-brand">
                  {index + 1}
                </span>
              </div>

              {/* Venue info */}
              <a
                href={`/kc/${item.neighborhoodSlug}/${item.venueSlug}/`}
                className="flex-1 min-w-0 group"
              >
                <h3 className="font-bold text-foreground group-hover:text-brand transition-colors truncate">
                  {item.venueName}
                </h3>
                <p className="text-xs text-muted mt-0.5">
                  Added{" "}
                  {new Date(item.addedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </p>
              </a>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={`/kc/${item.neighborhoodSlug}/${item.venueSlug}/`}
                  className="text-xs font-semibold text-brand hover:underline"
                >
                  View →
                </a>
                <button
                  onClick={() => remove(item.venueId)}
                  className="rounded-full p-1.5 text-muted hover:text-red-500 hover:bg-red-50 transition-colors"
                  title="Remove"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CTA at bottom */}
      {count > 0 && (
        <div className="mt-8 pt-6 border-t border-border text-center">
          <a
            href="/kc/"
            className="text-sm font-semibold text-brand hover:underline"
          >
            + Add more venues
          </a>
        </div>
      )}
    </div>
  );
}
