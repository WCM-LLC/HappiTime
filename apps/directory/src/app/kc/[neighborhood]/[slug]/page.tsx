import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getNeighborhood } from "@/lib/neighborhoods";
import { getVenueBySlug } from "@/lib/queries";
import { venueJsonLd, breadcrumbJsonLd } from "@/lib/structuredData";
import { PageTracker } from "@/components/PageTracker";
import { ItineraryButton } from "@/components/ItineraryButton";

export const revalidate = 900;

type Props = { params: Promise<{ neighborhood: string; slug: string }> };

const DOW_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return m === 0
    ? `${hour} ${period}`
    : `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const venue = await getVenueBySlug(slug);
  if (!venue) return {};

  const windowCount = venue.happy_hour_windows.length;
  const days = [
    ...new Set(
      venue.happy_hour_windows.flatMap((w) =>
        w.dow.map(
          (d) =>
            ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][Number(d)]
        )
      )
    ),
  ];
  const dayList = days.length > 0 ? days.slice(0, 3).join(", ") : "select days";

  return {
    title: `${venue.name} Happy Hour Specials & Deals — ${venue.city} | HappiTime`,
    description: `${venue.name} at ${venue.address} has ${windowCount} happy hour ${windowCount === 1 ? "special" : "specials"} on ${dayList}. See today's drink specials, food deals, full menu, and times for 2026.`,
    keywords: [
      `${venue.name} happy hour`,
      `${venue.name} specials`,
      `${venue.name} deals`,
      `${venue.city} happy hour`,
      "happy hour menu",
      "drink specials",
      "food deals",
    ],
    openGraph: {
      title: `${venue.name} Happy Hour Specials — HappiTime`,
      description: `Happy hour deals at ${venue.name}, ${venue.city} — ${windowCount} ${windowCount === 1 ? "special" : "specials"} with drink and food deals.`,
    },
  };
}

export default async function VenueDetailPage({ params }: Props) {
  const { neighborhood: neighborhoodSlug, slug } = await params;
  const neighborhood = getNeighborhood(neighborhoodSlug);
  const venue = await getVenueBySlug(slug);

  if (!venue) notFound();

  const jsonLd = venueJsonLd(venue);
  const breadcrumbs = breadcrumbJsonLd([
    { name: "HappiTime", url: "https://happitime.biz/" },
    { name: "Kansas City", url: "https://happitime.biz/kc/" },
    ...(neighborhood
      ? [
          {
            name: neighborhood.name,
            url: `https://happitime.biz/kc/${neighborhood.slug}/`,
          },
        ]
      : []),
    {
      name: venue.name,
      url: `https://happitime.biz/kc/${neighborhoodSlug}/${slug}/`,
    },
  ]);

  const todayIndex = new Date().getDay();

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <PageTracker pagePath={`/kc/${neighborhoodSlug}/${slug}/`} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}
      />

      {/* Breadcrumb */}
      <nav className="text-sm text-muted mb-6 flex items-center gap-1.5 flex-wrap">
        <a href="/" className="hover:text-foreground transition-colors">
          HappiTime
        </a>
        <span className="text-muted-light">/</span>
        <a href="/kc/" className="hover:text-foreground transition-colors">
          Kansas City
        </a>
        {neighborhood && (
          <>
            <span className="text-muted-light">/</span>
            <a
              href={`/kc/${neighborhood.slug}/`}
              className="hover:text-foreground transition-colors"
            >
              {neighborhood.name}
            </a>
          </>
        )}
        <span className="text-muted-light">/</span>
        <span className="text-foreground font-medium">{venue.name}</span>
      </nav>

      {/* Venue header */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-2">
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
            {venue.name}
          </h1>
          <ItineraryButton
            venueId={venue.id}
            venueName={venue.name}
            venueSlug={slug}
            neighborhoodSlug={neighborhoodSlug}
            size="md"
          />
        </div>
        <p className="text-muted">{venue.address}</p>
        <div className="flex flex-wrap items-center gap-3 mt-3 text-sm">
          {venue.rating != null && (
            <span className="font-semibold text-brand">
              ★ {Number(venue.rating).toFixed(1)}
            </span>
          )}
          {venue.price_tier != null && venue.price_tier > 0 && (
            <span className="text-muted font-medium">
              {"$".repeat(venue.price_tier)}
            </span>
          )}
          {venue.cuisine_type && (
            <span className="font-medium text-foreground">
              {venue.cuisine_type.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
            </span>
          )}
          {venue.tags.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {venue.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-brand-subtle px-2.5 py-0.5 text-xs font-medium text-brand-text"
                >
                  {tag.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                </span>
              ))}
              {venue.tags.length > 3 && (
                <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-muted">
                  +{venue.tags.length - 3} more
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Contact info */}
      {(venue.phone || venue.website) && (
        <div className="flex items-center gap-6 mb-8 text-sm">
          {venue.phone && (
            <a
              href={`tel:${venue.phone}`}
              className="text-brand font-medium hover:underline"
            >
              {venue.phone}
            </a>
          )}
          {venue.website && (
            <a
              href={venue.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand font-medium hover:underline"
            >
              Website →
            </a>
          )}
        </div>
      )}

      {/* Happy hour windows */}
      <section className="mb-12">
        <h2 className="text-xl font-bold text-foreground mb-5">
          Happy Hour Specials
        </h2>

        {venue.happy_hour_windows.length === 0 ? (
          <p className="text-muted">
            No active happy hours at the moment. Check back soon!
          </p>
        ) : (
          <div className="space-y-6">
            {venue.happy_hour_windows.map((w) => {
              const isToday = w.dow.map(Number).includes(todayIndex);
              const dayNames = w.dow
                .map((d) => DOW_NAMES[Number(d)])
                .join(", ");

              return (
                <div
                  key={w.id}
                  className={`rounded-2xl border p-5 ${
                    isToday
                      ? "border-brand bg-brand-subtle/50"
                      : "border-border bg-surface"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      {w.label && (
                        <h3 className="font-bold text-foreground">{w.label}</h3>
                      )}
                      <p className="text-sm text-muted">{dayNames}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold text-foreground text-sm">
                        {formatTime(w.start_time)} – {formatTime(w.end_time)}
                      </p>
                      {isToday && (
                        <span className="inline-flex items-center gap-1 text-xs text-brand font-semibold mt-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-brand" />
                          Today
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Menu items */}
                  {w.menu_items.length > 0 && (
                    <div className="border-t border-border pt-3 mt-3">
                      <p className="text-[10px] uppercase tracking-wider text-muted-light font-semibold mb-2">
                        Menu
                      </p>
                      <div className="space-y-2">
                        {w.menu_items.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-start justify-between text-sm"
                          >
                            <div className="min-w-0">
                              <p className="font-medium text-foreground">
                                {item.name}
                              </p>
                              {item.description && (
                                <p className="text-xs text-muted mt-0.5">
                                  {item.description}
                                </p>
                              )}
                            </div>
                            {item.price != null && (
                              <span className="font-semibold text-brand ml-4 shrink-0">
                                ${item.price.toFixed(2)}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Upcoming events */}
      {venue.venue_events.length > 0 && (
        <section className="mb-12">
          <h2 className="text-xl font-bold text-foreground mb-5">
            Upcoming Events
          </h2>
          <div className="space-y-4">
            {venue.venue_events.map((ev) => {
              const eventDate = new Date(ev.starts_at);
              const dateStr = eventDate.toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
              });
              const timeStr = eventDate.toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
              });
              const eventTypeLabel =
                ev.event_type === "live_music"
                  ? "Live Music"
                  : ev.event_type.charAt(0).toUpperCase() +
                    ev.event_type.slice(1);

              return (
                <div
                  key={ev.id}
                  className="rounded-2xl border border-border bg-surface p-5"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <h3 className="font-bold text-foreground">{ev.title}</h3>
                      <p className="text-sm text-muted">
                        {ev.is_recurring ? (() => {
                          const dayMap: Record<string, string> = { SU: 'Sun', MO: 'Mon', TU: 'Tue', WE: 'Wed', TH: 'Thu', FR: 'Fri', SA: 'Sat' };
                          const match = (ev.recurrence_rule ?? '').match(/BYDAY=([A-Z,]+)/);
                          const days = match ? match[1].split(',').map((d: string) => dayMap[d] ?? d).join(', ') : '';
                          return days ? `Every ${days}` : 'Recurring';
                        })() : dateStr} at {timeStr}
                        {ev.ends_at && ` – ${new Date(ev.ends_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`}
                      </p>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      <span className="rounded-full bg-brand-subtle px-2.5 py-0.5 text-xs font-medium text-brand-text">
                        {eventTypeLabel}
                      </span>
                      {ev.price_info && (
                        <span className="text-xs font-semibold text-brand">
                          {ev.price_info}
                        </span>
                      )}
                    </div>
                  </div>
                  {ev.description && (
                    <p className="text-sm text-muted mb-3">{ev.description}</p>
                  )}
                  {(ev.external_url || ev.ticket_url) && (
                    <div className="flex gap-3">
                      {ev.external_url && (
                        <a
                          href={ev.external_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-semibold text-brand hover:underline"
                        >
                          More info →
                        </a>
                      )}
                      {ev.ticket_url && (
                        <a
                          href={ev.ticket_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-semibold text-brand hover:underline"
                        >
                          Get tickets →
                        </a>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Venue photos */}
      {venue.venue_media.filter((m) => m.type === "image").length > 0 && (
        <section className="mb-12">
          <h2 className="text-xl font-bold text-foreground mb-5">Photos</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {venue.venue_media
              .filter((m) => m.type === "image")
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((m) => (
                <div
                  key={m.id}
                  className="aspect-[4/3] rounded-xl overflow-hidden border border-border"
                >
                  <img
                    src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/venue-media/${m.storage_path}`}
                    alt={m.title ?? `${venue.name} photo`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
              ))}
          </div>
        </section>
      )}

      {/* Map embed placeholder */}
      {venue.lat && venue.lng && (
        <section className="mb-12">
          <h2 className="text-xl font-bold text-foreground mb-4">Location</h2>
          <div className="rounded-2xl border border-border overflow-hidden">
            <iframe
              title={`Map of ${venue.name}`}
              width="100%"
              height="300"
              style={{ border: 0 }}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              src={`https://www.google.com/maps/embed/v1/place?key=${process.env.NEXT_PUBLIC_MAPS_API_KEY ?? ""}&q=${encodeURIComponent(venue.name + " " + venue.address)}`}
            />
          </div>
        </section>
      )}

      {/* Claim CTA */}
      <section className="rounded-2xl border border-border bg-surface p-6 mb-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="font-bold text-foreground">
            Is this your place?
          </h2>
          <p className="text-sm text-muted mt-1">
            Claim your venue to manage hours, menus, and deals &mdash; 50% off
            for your first 3 months.
          </p>
        </div>
        <a
          href="/claim/"
          className="inline-block rounded-full bg-brand px-6 py-2.5 text-white font-semibold text-sm hover:bg-brand-dark transition-colors shrink-0"
        >
          Claim This Venue
        </a>
      </section>

      {/* App CTA */}
      <section className="rounded-2xl bg-brand-subtle p-8 text-center">
        <h2 className="text-lg font-bold text-foreground mb-2">
          Save {venue.name} to your favorites
        </h2>
        <p className="text-sm text-muted mb-4">
          Get notified when happy hour starts and see what friends are checking
          out nearby.
        </p>
        <a
          href="/app/"
          className="inline-block rounded-full bg-brand px-6 py-2.5 text-white font-semibold text-sm hover:bg-brand-dark transition-colors"
        >
          Open in App
        </a>
      </section>
    </div>
  );
}
