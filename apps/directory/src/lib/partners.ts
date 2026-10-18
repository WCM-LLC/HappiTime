/**
 * Partner / affiliate pages — https://happitime.biz/partners/{slug}/
 *
 * One config entry per partner. Everything customer-facing on the page comes
 * from here, so keep it free of internal notes, provenance tags, or @handles
 * that aren't meant for the public (this copy renders on the live site).
 *
 * Operating rules for this file:
 * - Tour dates, prices, and pickup details must match what the partner
 *   publishes on its own booking page. When the partner cancels a date, flip
 *   that date's `status` to "cancelled" — don't delete it (the page shows it
 *   struck through so riders who saw it earlier aren't confused).
 * - `venueSlugs` on a tour date lists that week's stops. Only slugs that resolve
 *   to a *published* HappiTime venue are rendered; unknown slugs are skipped
 *   silently, so an un-onboarded venue can never produce a dead link.
 * - Never add Vine Street Brewing / Kemet Coleman to any partner entry
 *   (HT-POL-005).
 */

export type TourDate = {
  /** Local (America/Chicago) date, YYYY-MM-DD. */
  date: string;
  /** Local departure time, 24h HH:MM. */
  departs: string;
  status: "scheduled" | "cancelled";
  /** HappiTime venue slugs for this date's stops (announced ~1 week out). */
  venueSlugs: string[];
};

export type PartnerFaq = { question: string; answer: string };

export type Partner = {
  slug: string;
  /**
   * "coming_soon": teased on /sponsored-events/ (Coming soon tab); the partner
   * page 404s and stays out of the sitemap. "live": the full page is published
   * at /partners/{slug}/. Flip to "live" once dates, prices and the stop
   * lineup are confirmed with the partner.
   */
  status: "coming_soon" | "live";
  /** One or two sentences for the Coming soon card. */
  teaser: string;
  name: string;
  /** Short descriptor used in titles, e.g. "KCK Taco Bus Tour". */
  offeringName: string;
  seo: { title: string; description: string; keywords: string[] };
  intro: string;
  websiteUrl: string;
  /** Partner's booking page. UTM params are appended at render time. */
  bookingUrl: string;
  instagramUrl?: string;
  facebookUrl?: string;
  /** HappiTime Super User handle — powers the /r/{handle} app-install link. */
  referralHandle: string;
  /** UTM campaign for outbound partner links (utm_source=happitime, utm_medium=affiliate). */
  utmCampaign: string;
  tour: {
    priceUsd: number;
    durationNote: string;
    pickupName: string;
    pickupAddress: string;
    includes: string[];
    dates: TourDate[];
  };
  /** In-app perk for HappiTime users. The code itself lives in the app only. */
  appPerk?: {
    /** Keep false until the discount code is actually visible in the app. */
    live: boolean;
    headline: string;
    body: string;
  };
  /** Taco Ticket (digital coupon book) state. */
  couponBook: {
    name: string;
    status: "hidden" | "coming_soon" | "on_sale";
    /** Optional launch label shown when coming_soon, e.g. "Oct 3". */
    launchLabel?: string;
    /** Stripe Checkout / Payment Link URL — required when status is on_sale. */
    checkoutUrl?: string;
    pitch: string;
  };
  faqs: PartnerFaq[];
};

export const PARTNERS: Partner[] = [
  {
    slug: "red-machine-party-bus",
    status: "coming_soon",
    teaser:
      "An evening party-bus tour of four Kansas City, Kansas taquerias. You sample a taco at every stop and judge the lineup, and someone else drives.",
    name: "Red Machine Party Bus",
    offeringName: "KCK Taco Bus Tour",
    seo: {
      title: "KCK Taco Bus Tour with Red Machine Party Bus",
      description:
        "Ride the Red Machine Party Bus to four Kansas City, Kansas taquerias in one evening. Tour dates, pickup details, this week's stops, and the HappiTime app perk.",
      keywords: [
        "KCK taco tour",
        "taco bus tour Kansas City",
        "Kansas City Kansas tacos",
        "Red Machine Party Bus",
        "taco crawl KCK",
        "things to do in Kansas City Kansas",
      ],
    },
    intro:
      "Kansas City, Kansas is known for its taquerias, and one of the easiest ways to eat your way through it is on a party bus. Red Machine runs an evening tour to four KCK taquerias: you sample a taco at every stop, judge the lineup, and let someone else drive.",
    websiteUrl: "https://www.redmachinepartybus.com/",
    bookingUrl: "https://www.redmachinepartybus.com/kck-taco-trail-bus-tour.html",
    instagramUrl: "https://www.instagram.com/redmachinepartybus/",
    facebookUrl: "https://www.facebook.com/RedMachinePartyBus",
    referralHandle: "redmachinekc",
    utmCampaign: "red-machine-kck-taco-tour",
    tour: {
      priceUsd: 39.99,
      durationNote: "Departs 5:30 PM, back by about 8:15 PM",
      pickupName: "Hilton Garden Inn (hotel lobby)",
      pickupAddress: "520 Minnesota Ave, Kansas City, KS 66101",
      includes: [
        "Four taqueria stops, one taco sample at each",
        "You judge the lineup",
        "Party bus ride with music",
      ],
      dates: [
        { date: "2026-09-22", departs: "17:30", status: "scheduled", venueSlugs: [] },
        { date: "2026-09-29", departs: "17:30", status: "scheduled", venueSlugs: [] },
        { date: "2026-10-13", departs: "17:30", status: "scheduled", venueSlugs: [] },
        { date: "2026-10-20", departs: "17:30", status: "scheduled", venueSlugs: [] },
      ],
    },
    appPerk: {
      live: false,
      headline: "HappiTime app users save on the tour",
      body: "Open the HappiTime app to get your Red Machine discount code, then use it when you book.",
    },
    couponBook: {
      name: "Taco Ticket",
      status: "coming_soon",
      pitch:
        "A digital book of taco deals at KCK spots, with every offer confirmed with the restaurant. Buy it once, claim it in the app, and redeem at the counter.",
    },
    faqs: [
      {
        question: "Where does the KCK taco bus tour start?",
        answer:
          "Pickup and drop-off are in the lobby of the Hilton Garden Inn at 520 Minnesota Ave, Kansas City, KS. There is a free parking lot across the street.",
      },
      {
        question: "How much is the Red Machine taco tour?",
        answer:
          "Tickets are $39.99 per person on Red Machine's booking page, and they include a taco sample at each of the four stops. Confirm the current price when you book.",
      },
      {
        question: "Which taquerias are on the tour?",
        answer:
          "The stops rotate. Red Machine confirms each tour's lineup about a week ahead, and we post it on this page as soon as it's set.",
      },
    ],
  },
];

export function getPartner(slug: string): Partner | undefined {
  return PARTNERS.find((p) => p.slug === slug);
}

/** A partner whose full page is published; null for unknown or coming-soon slugs. */
export function getLivePartner(slug: string): Partner | undefined {
  const p = getPartner(slug);
  return p?.status === "live" ? p : undefined;
}

export const livePartners = (): Partner[] => PARTNERS.filter((p) => p.status === "live");
export const comingSoonPartners = (): Partner[] => PARTNERS.filter((p) => p.status === "coming_soon");

/** Append HappiTime affiliate UTM params to an outbound partner URL. */
export function withAffiliateUtm(url: string, campaign: string, content: string): string {
  const u = new URL(url);
  u.searchParams.set("utm_source", "happitime");
  u.searchParams.set("utm_medium", "affiliate");
  u.searchParams.set("utm_campaign", campaign);
  u.searchParams.set("utm_content", content);
  return u.toString();
}

/** Today's date in Kansas City as YYYY-MM-DD. */
export function kcTodayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Upcoming (today or later, KC time) tour dates, including cancelled ones. */
export function upcomingTourDates(partner: Partner, now: Date = new Date()): TourDate[] {
  const today = kcTodayIso(now);
  return partner.tour.dates
    .filter((d) => d.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
}
