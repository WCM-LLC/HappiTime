import type { VenueWithWindows } from "@/lib/queries";

const DOW_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return m === 0 ? `${hour}${period}` : `${hour}:${String(m).padStart(2, "0")}${period}`;
}

function formatPriceTier(tier: number | null): string | null {
  return typeof tier === "number" && tier > 0 ? "$".repeat(tier) : null;
}

type VenueCardProps = {
  venue: VenueWithWindows;
  neighborhoodSlug: string;
  todayIndex: number;
};

export function VenueCard({ venue, neighborhoodSlug, todayIndex }: VenueCardProps) {
  const priceTier = formatPriceTier(venue.price_tier);
  const todayWindows = venue.happy_hour_windows.filter((w) =>
    w.dow.map(Number).includes(todayIndex)
  );
  const hasHappyHourToday = todayWindows.length > 0;
  const promoTier = venue.promotion_tier;
  const isPromoted = promoTier != null;

  const promoBorderClass =
    promoTier === "featured" ? "border-brand bg-[#FFF8F0]"
    : promoTier === "premium" ? "border-[#8B5CF6] bg-[#F5F3FF]"
    : promoTier === "basic" ? "border-[#60A5FA] bg-[#EFF6FF]"
    : "border-border bg-surface";

  const promoBadgeClass =
    promoTier === "featured" ? "bg-brand text-white"
    : promoTier === "premium" ? "bg-[#7C3AED] text-white"
    : "bg-[#2563EB] text-white";

  const promoLabel =
    promoTier === "featured" ? "★ Featured"
    : promoTier === "premium" ? "Premium"
    : promoTier === "basic" ? "Promoted"
    : null;

  return (
    <a
      href={`/kc/${neighborhoodSlug}/${venue.slug}/`}
      className={`group block rounded-2xl border ${isPromoted ? promoBorderClass : "border-border bg-surface"} p-5 hover:border-brand hover:shadow-md transition-all ${isPromoted ? "border-[1.5px]" : ""}`}
    >
      {/* Promotion badge */}
      {isPromoted && promoLabel && (
        <div className="mb-2">
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${promoBadgeClass}`}>
            {promoLabel}
          </span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="font-bold text-foreground group-hover:text-brand transition-colors truncate">
            {venue.name}
          </h3>
          <p className="text-xs text-muted truncate mt-0.5">{venue.address}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {venue.rating != null && (
            <span className="text-xs font-semibold text-brand">
              ★ {Number(venue.rating).toFixed(1)}
            </span>
          )}
          {priceTier && (
            <span className="text-xs text-muted font-medium">{priceTier}</span>
          )}
        </div>
      </div>

      {/* Today badge + cuisine */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {hasHappyHourToday && (
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-subtle px-2.5 py-1 text-xs font-semibold text-brand-text">
            <span className="w-1.5 h-1.5 rounded-full bg-brand" />
            Happy hour today
          </span>
        )}
        {venue.cuisine_type && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
            {venue.cuisine_type.replace(/[_-]/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
          </span>
        )}
        {venue.venue_events.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2.5 py-1 text-xs font-semibold text-purple-700">
            {venue.venue_events.length} event{venue.venue_events.length > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Windows */}
      <div className="space-y-2">
        {venue.happy_hour_windows.slice(0, 3).map((w) => (
          <div key={w.id} className="flex items-center justify-between text-xs">
            <div className="flex gap-1">
              {w.dow.map((d) => (
                <span
                  key={d}
                  className={`px-1 py-0.5 rounded text-[10px] font-medium ${
                    Number(d) === todayIndex
                      ? "bg-brand text-white"
                      : "bg-gray-100 text-muted"
                  }`}
                >
                  {DOW_SHORT[Number(d)]}
                </span>
              ))}
            </div>
            <span className="text-muted font-medium">
              {formatTime(w.start_time)} – {formatTime(w.end_time)}
            </span>
          </div>
        ))}
      </div>

      {/* Menu preview */}
      {todayWindows.length > 0 && todayWindows[0].menu_items.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-[10px] uppercase tracking-wider text-muted-light font-semibold mb-1.5">
            Featured deals
          </p>
          <div className="flex flex-wrap gap-1.5">
            {todayWindows[0].menu_items.slice(0, 4).map((item) => (
              <span
                key={item.id}
                className="text-xs bg-brand-subtle text-brand-text rounded-full px-2 py-0.5 font-medium"
              >
                {item.name}
                {item.price != null && ` $${item.price}`}
              </span>
            ))}
          </div>
        </div>
      )}

      <span className="inline-flex items-center mt-3 text-xs font-semibold text-brand">
        View details →
      </span>
    </a>
  );
}
