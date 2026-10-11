import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageTracker } from "@/components/PageTracker";
import { TrackedLink } from "@/components/TrackedLink";
import { venuePath } from "@/lib/neighborhoods";
import {
  upcomingTourDates,
  withAffiliateUtm,
  type Partner,
  type TourDate,
  getLivePartner,
  livePartners,
} from "@/lib/partners";
import { breadcrumbJsonLd, faqPageJsonLd } from "@/lib/structuredData";
import { supabase } from "@/lib/supabase";
import { DEFAULT_OG_IMAGE } from "@/lib/seoText";

// Partner / affiliate landing: https://happitime.biz/partners/{slug}/
// Indexable (unlike /r/{handle}): this page is the partnership's search surface.
// Revalidates hourly so a week's stops appear once their venues are published.
export const revalidate = 3600;

const BASE = "https://happitime.biz";

type Props = { params: Promise<{ slug: string }> };

// Only live partners get a page; coming-soon ones are teased on
// /sponsored-events/ and 404 here until their status flips (lib/partners.ts).
export function generateStaticParams() {
  return livePartners().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const partner = getLivePartner(slug);
  if (!partner) return {};
  const canonical = `${BASE}/partners/${partner.slug}/`;
  return {
    title: partner.seo.title,
    description: partner.seo.description,
    keywords: partner.seo.keywords,
    alternates: { canonical },
    openGraph: {
      title: partner.seo.title,
      description: partner.seo.description,
      url: canonical,
      type: "website",
      siteName: "HappiTime",
      images: [DEFAULT_OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: partner.seo.title,
      description: partner.seo.description,
    },
  };
}

type LineupVenue = { id: string; name: string; slug: string; lat: number | null; lng: number | null };

/** Only published venues render, so an un-onboarded stop never becomes a dead link. */
async function getLineupVenues(slugs: string[]): Promise<Map<string, LineupVenue>> {
  const out = new Map<string, LineupVenue>();
  if (slugs.length === 0) return out;
  const { data, error } = await supabase
    .from("venues")
    .select("id, name, slug, lat, lng")
    .in("slug", slugs)
    .eq("status", "published");
  if (error) {
    console.error("[directory] partner lineup query failed:", error.message);
    return out;
  }
  for (const v of (data ?? []) as LineupVenue[]) out.set(v.slug, v);
  return out;
}

/** UTC offset for America/Chicago on a given local date, e.g. "-05:00". */
function kcOffset(date: string, time: string): string {
  const probe = new Date(`${date}T${time}:00Z`);
  const part = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    timeZoneName: "longOffset",
  })
    .formatToParts(probe)
    .find((p) => p.type === "timeZoneName")?.value;
  const m = part?.match(/GMT([+-]\d{2}:\d{2})/);
  return m ? m[1] : "-06:00";
}

function formatTourDate(date: string): string {
  // Noon UTC keeps the calendar day stable in any server timezone.
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(`${date}T12:00:00Z`));
}

function formatDeparts(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

function tourEventsJsonLd(partner: Partner, dates: TourDate[]): object[] {
  return dates.map((d) => ({
    "@context": "https://schema.org",
    "@type": "Event",
    name: partner.offeringName,
    description: partner.intro,
    startDate: `${d.date}T${d.departs}:00${kcOffset(d.date, d.departs)}`,
    eventStatus:
      d.status === "cancelled"
        ? "https://schema.org/EventCancelled"
        : "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: {
      "@type": "Place",
      name: partner.tour.pickupName,
      address: partner.tour.pickupAddress,
    },
    organizer: { "@type": "Organization", name: partner.name, url: partner.websiteUrl },
    offers: {
      "@type": "Offer",
      price: partner.tour.priceUsd.toFixed(2),
      priceCurrency: "USD",
      url: partner.bookingUrl,
    },
  }));
}

export default async function PartnerPage({ params }: Props) {
  const { slug } = await params;
  const partner = getLivePartner(slug);
  if (!partner) notFound();

  const pagePath = `/partners/${partner.slug}/`;
  const canonical = `${BASE}${pagePath}`;
  const dates = upcomingTourDates(partner);
  const lineup = await getLineupVenues(Array.from(new Set(dates.flatMap((d) => d.venueSlugs))));
  const appHref = `/r/${partner.referralHandle}`;
  const bookHref = (content: string) =>
    withAffiliateUtm(partner.bookingUrl, partner.utmCampaign, content);

  const jsonLd = [
    breadcrumbJsonLd([
      { name: "HappiTime", url: `${BASE}/` },
      { name: "Partners", url: canonical },
      { name: partner.name, url: canonical },
    ]),
    faqPageJsonLd(partner.faqs),
    ...tourEventsJsonLd(partner, dates),
  ];

  const book = partner.couponBook;
  const perk = partner.appPerk?.live ? partner.appPerk : null;
  const meta = { partner: partner.slug };

  return (
    <article className="mx-auto max-w-3xl px-6 py-12">
      <PageTracker pagePath={pagePath} />
      {jsonLd.map((obj, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(obj) }}
        />
      ))}

      <nav className="text-sm text-muted mb-6 flex items-center gap-1.5">
        <Link href="/" className="hover:text-foreground transition-colors">HappiTime</Link>
        <span className="text-muted-light">/</span>
        <span>Partners</span>
        <span className="text-muted-light">/</span>
        <span className="text-foreground font-medium">{partner.name}</span>
      </nav>

      <p className="text-xs font-semibold uppercase tracking-wide text-brand mb-2">
        HappiTime partner
      </p>
      <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground mb-3">
        {partner.offeringName}{" "}
        <span className="text-brand">with {partner.name}</span>
      </h1>
      <p className="text-muted text-lg mb-8 max-w-2xl">{partner.intro}</p>

      <div className="flex flex-wrap gap-3 mb-12">
        <TrackedLink
          href={bookHref("hero_book")}
          eventType="cta_click"
          pagePath={pagePath}
          meta={{ ...meta, cta: "book_tour", placement: "hero" }}
          className="inline-block rounded-full bg-brand px-6 py-2.5 text-white font-semibold text-sm hover:bg-brand-dark transition-colors"
        >
          Book the tour — ${partner.tour.priceUsd.toFixed(2)}
        </TrackedLink>
        <TrackedLink
          href={appHref}
          eventType="cta_click"
          pagePath={pagePath}
          meta={{ ...meta, cta: "get_app", placement: "hero" }}
          className="inline-block rounded-full border border-brand px-6 py-2.5 text-brand font-semibold text-sm hover:bg-brand hover:text-white transition-colors"
        >
          Get the HappiTime app
        </TrackedLink>
      </div>

      {/* Tour details */}
      <section className="mb-10">
        <h2 className="text-2xl font-bold text-foreground mb-3">How the tour works</h2>
        <ul className="list-disc list-inside text-muted space-y-1.5 leading-relaxed mb-4">
          {partner.tour.includes.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <dl className="grid gap-3 sm:grid-cols-3 text-sm">
          <div className="rounded-xl border border-border p-4">
            <dt className="text-muted-light text-xs uppercase tracking-wide">Price</dt>
            <dd className="font-semibold text-foreground mt-1">
              ${partner.tour.priceUsd.toFixed(2)} per person
            </dd>
          </div>
          <div className="rounded-xl border border-border p-4">
            <dt className="text-muted-light text-xs uppercase tracking-wide">Timing</dt>
            <dd className="font-semibold text-foreground mt-1">{partner.tour.durationNote}</dd>
          </div>
          <div className="rounded-xl border border-border p-4">
            <dt className="text-muted-light text-xs uppercase tracking-wide">Pickup</dt>
            <dd className="font-semibold text-foreground mt-1">{partner.tour.pickupName}</dd>
            <dd className="text-muted mt-0.5">{partner.tour.pickupAddress}</dd>
          </div>
        </dl>
        <p className="text-xs text-muted-light mt-3">
          Dates, prices, and pickup details come from {partner.name}. Confirm them when you book.
        </p>
      </section>

      {/* Upcoming dates + weekly lineup */}
      <section className="mb-10">
        <h2 className="text-2xl font-bold text-foreground mb-3">Upcoming tours</h2>
        {dates.length === 0 ? (
          <p className="text-muted">
            New dates are coming soon.{" "}
            <TrackedLink
              href={bookHref("no_dates")}
              eventType="cta_click"
              pagePath={pagePath}
              meta={{ ...meta, cta: "book_tour", placement: "no_dates" }}
              className="text-brand font-medium hover:underline"
            >
              Check {partner.name}&apos;s schedule
            </TrackedLink>
            .
          </p>
        ) : (
          <ul className="space-y-3">
            {dates.map((d) => {
              const cancelled = d.status === "cancelled";
              const stops = d.venueSlugs
                .map((s) => lineup.get(s))
                .filter((v): v is LineupVenue => Boolean(v));
              return (
                <li key={d.date} className="rounded-xl border border-border p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className={`font-semibold ${cancelled ? "text-muted-light line-through" : "text-foreground"}`}>
                      {formatTourDate(d.date)} · {formatDeparts(d.departs)}
                    </p>
                    {cancelled ? (
                      <span className="text-xs font-semibold uppercase text-muted">Cancelled</span>
                    ) : (
                      <TrackedLink
                        href={bookHref(`date_${d.date}`)}
                        eventType="cta_click"
                        pagePath={pagePath}
                        meta={{ ...meta, cta: "book_tour", placement: "date", tour_date: d.date }}
                        className="text-sm text-brand font-semibold hover:underline"
                      >
                        Book this date →
                      </TrackedLink>
                    )}
                  </div>
                  {!cancelled && (
                    <p className="text-sm text-muted mt-1.5">
                      {stops.length > 0 ? (
                        <>
                          Stops:{" "}
                          {stops.map((v, i) => (
                            <span key={v.id}>
                              {i > 0 && " · "}
                              <TrackedLink
                                href={venuePath(v)}
                                eventType="venue_click"
                                venueId={v.id}
                                pagePath={pagePath}
                                meta={{ ...meta, placement: "lineup", tour_date: d.date }}
                                className="text-brand hover:underline"
                              >
                                {v.name}
                              </TrackedLink>
                            </span>
                          ))}
                        </>
                      ) : (
                        "Stops are announced about a week before the tour."
                      )}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* In-app perk (only once the code is live in the app) */}
      {perk && (
        <section className="mb-10 rounded-2xl border border-brand-light p-6">
          <h2 className="text-xl font-bold text-foreground mb-2">{perk.headline}</h2>
          <p className="text-muted mb-4">{perk.body}</p>
          <TrackedLink
            href={appHref}
            eventType="cta_click"
            pagePath={pagePath}
            meta={{ ...meta, cta: "get_app", placement: "perk" }}
            className="inline-block rounded-full bg-brand px-5 py-2 text-white font-semibold text-sm hover:bg-brand-dark transition-colors"
          >
            Get the code in the app
          </TrackedLink>
        </section>
      )}

      {/* Coupon book */}
      {book.status !== "hidden" && (
        <section className="mb-10 rounded-2xl bg-brand-subtle p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-dark mb-1">
            {book.status === "on_sale"
              ? "On sale now"
              : `Coming ${book.launchLabel ?? "soon"}`}
          </p>
          <h2 className="text-2xl font-bold text-foreground mb-2">{book.name}</h2>
          <p className="text-muted mb-5 max-w-xl">{book.pitch}</p>
          {book.status === "on_sale" && book.checkoutUrl ? (
            <TrackedLink
              href={book.checkoutUrl}
              eventType="cta_click"
              pagePath={pagePath}
              meta={{ ...meta, cta: "buy_coupon_book" }}
              className="inline-block rounded-full bg-brand px-6 py-2.5 text-white font-semibold text-sm hover:bg-brand-dark transition-colors"
            >
              Get your {book.name}
            </TrackedLink>
          ) : (
            <TrackedLink
              href={appHref}
              eventType="cta_click"
              pagePath={pagePath}
              meta={{ ...meta, cta: "get_app", placement: "coupon_book_waitlist" }}
              className="inline-block rounded-full bg-brand px-6 py-2.5 text-white font-semibold text-sm hover:bg-brand-dark transition-colors"
            >
              Get the app to hear first
            </TrackedLink>
          )}
        </section>
      )}

      {/* FAQ */}
      <section className="mb-10">
        <h2 className="text-2xl font-bold text-foreground mb-4">Frequently Asked Questions</h2>
        <div className="space-y-4">
          {partner.faqs.map((f) => (
            <div key={f.question}>
              <h3 className="font-semibold text-foreground">{f.question}</h3>
              <p className="text-muted text-sm leading-relaxed mt-1">{f.answer}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Partner links + related */}
      <section className="mb-10">
        <h2 className="text-lg font-bold text-foreground mb-3">More from {partner.name}</h2>
        <div className="flex flex-wrap gap-2">
          <TrackedLink
            href={withAffiliateUtm(partner.websiteUrl, partner.utmCampaign, "footer_site")}
            eventType="cta_click"
            pagePath={pagePath}
            meta={{ ...meta, cta: "partner_site" }}
            className="rounded-full border border-border px-4 py-1.5 text-sm font-medium text-muted hover:text-brand hover:border-brand transition-colors"
          >
            Website
          </TrackedLink>
          {partner.instagramUrl && (
            <TrackedLink
              href={partner.instagramUrl}
              eventType="cta_click"
              pagePath={pagePath}
              meta={{ ...meta, cta: "partner_instagram" }}
              className="rounded-full border border-border px-4 py-1.5 text-sm font-medium text-muted hover:text-brand hover:border-brand transition-colors"
            >
              Instagram
            </TrackedLink>
          )}
          {partner.facebookUrl && (
            <TrackedLink
              href={partner.facebookUrl}
              eventType="cta_click"
              pagePath={pagePath}
              meta={{ ...meta, cta: "partner_facebook" }}
              className="rounded-full border border-border px-4 py-1.5 text-sm font-medium text-muted hover:text-brand hover:border-brand transition-colors"
            >
              Facebook
            </TrackedLink>
          )}
          <Link
            href="/guides/best-happy-hour-food-kansas-city/"
            className="rounded-full border border-border px-4 py-1.5 text-sm font-medium text-muted hover:text-brand hover:border-brand transition-colors"
          >
            Best Happy Hour Food in KC
          </Link>
        </div>
      </section>
    </article>
  );
}
