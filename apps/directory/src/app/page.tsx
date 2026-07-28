/**
 * HOME PAGE — the fork opener.
 * =============================
 * When NEXT_PUBLIC_COMING_SOON=true → shows the pre-launch splash page.
 * Otherwise → the two-door opener (take 1a of the HappiTime Opener design):
 * a live Kansas City clock, then "drinks" → /kc/ or "pouring" → /pricing/.
 *
 * To switch modes:
 *   1. Set the env var in Vercel (Settings → Environment Variables)
 *   2. Redeploy
 *
 * This used to redirect straight to /kc/. `/` is now a real indexable page, so
 * the metadata below deliberately targets happy-hour search intent even though
 * the page copy asks a question — the title and description carry the keywords,
 * the page carries the experience. Sitewide Organization and WebSite JSON-LD
 * still come from layout.tsx.
 */
import type { Metadata } from "next";
import ComingSoon from "./coming-soon";
import ForkOpener from "@/components/ForkOpener";
import { getOpenerProps } from "@/lib/liveDeals";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "HappiTime — Kansas City Happy Hour Deals, Live Right Now",
  description:
    "See which Kansas City happy hours are pouring right now, sorted by what ends soonest — Westport, Power & Light, Crossroads, the Plaza and more. Own a venue? See what it costs to fill your slow hours.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "HappiTime — Kansas City Happy Hour Deals, Live Right Now",
    description:
      "Which Kansas City happy hours are pouring right now, sorted by what ends soonest.",
    url: "https://happitime.biz",
  },
};

export default async function HomePage() {
  if (process.env.NEXT_PUBLIC_COMING_SOON === "true") {
    return <ComingSoon />;
  }

  return <ForkOpener {...(await getOpenerProps())} />;
}
