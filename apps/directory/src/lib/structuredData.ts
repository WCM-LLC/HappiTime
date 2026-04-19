import type { VenueWithWindows, HappyHourWindow } from "./queries";

const DOW_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/**
 * Generate JSON-LD structured data for a venue.
 * Uses schema.org Restaurant + FoodEvent for happy hour windows.
 */
export function venueJsonLd(venue: VenueWithWindows): object {
  const events = venue.happy_hour_windows.map((w) => foodEventJsonLd(venue, w));

  return {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: venue.name,
    address: {
      "@type": "PostalAddress",
      streetAddress: venue.address,
      addressLocality: venue.city,
      addressRegion: venue.state,
    },
    geo: venue.lat && venue.lng
      ? {
          "@type": "GeoCoordinates",
          latitude: venue.lat,
          longitude: venue.lng,
        }
      : undefined,
    telephone: venue.phone ?? undefined,
    url: venue.website ?? undefined,
    priceRange: venue.price_tier
      ? "$".repeat(venue.price_tier)
      : undefined,
    aggregateRating: venue.rating
      ? {
          "@type": "AggregateRating",
          ratingValue: venue.rating,
          bestRating: 5,
        }
      : undefined,
    event: events.length > 0 ? events : undefined,
  };
}

function foodEventJsonLd(
  venue: VenueWithWindows,
  window: HappyHourWindow
): object {
  const dayNames = window.dow
    .map((d) => DOW_NAMES[d])
    .filter(Boolean)
    .join(", ");

  const offers = window.menu_items
    .filter((item) => item.price != null)
    .map((item) => ({
      "@type": "Offer",
      name: item.name,
      description: item.description ?? undefined,
      price: item.price!.toFixed(2),
      priceCurrency: "USD",
    }));

  return {
    "@type": "FoodEvent",
    name: window.label ?? `Happy Hour at ${venue.name}`,
    description: `Happy hour specials every ${dayNames} from ${formatTime(window.start_time)} to ${formatTime(window.end_time)}`,
    location: {
      "@type": "Place",
      name: venue.name,
      address: venue.address,
    },
    offers: offers.length > 0 ? offers : undefined,
  };
}

function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return m === 0 ? `${hour} ${period}` : `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

/**
 * Generate BreadcrumbList JSON-LD for a page.
 */
export function breadcrumbJsonLd(
  items: { name: string; url: string }[]
): object {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}
