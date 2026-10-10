import type { Metadata } from "next";
import { Abril_Fatface, Archivo } from "next/font/google";
import { PageTracker } from "@/components/PageTracker";
import { BrunchRsvp } from "./BrunchRsvp";
import { Postponed } from "./Postponed";
import "./brunch.css";

// The Oct 11 date was pushed back (2026-10-09). Set to false once the new date
// is confirmed, and update the date copy in markup.ts and ../page.tsx.
const POSTPONED = true;

const display = Abril_Fatface({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-slb-display",
  display: "swap",
});
const sans = Archivo({
  weight: ["400", "500", "600", "800", "900"],
  subsets: ["latin"],
  variable: "--font-slb-sans",
  display: "swap",
});

export const metadata: Metadata = POSTPONED
  ? {
      title: "The Social Life Brunch — Fall Edition (new date coming)",
      description:
        "The Blacklist × MEPA present The Social Life Brunch, Fall Edition. The Fall Edition has moved off October 11; a new date is being set. Existing RSVPs carry over. Powered by HappiTime.",
      alternates: { canonical: "/sponsored-events/social-life-brunch/" },
      robots: { index: false },
      openGraph: {
        title: "The Social Life Brunch — Fall Edition",
        description:
          "Invitation-only brunch × day party at 18th & Vine. New date to be announced. RSVPs carry over.",
        url: "https://happitime.biz/sponsored-events/social-life-brunch/",
        images: [{ url: "/sponsored-events/social-life-brunch/portrait.jpg" }],
      },
    }
  : {
      title: "The Social Life Brunch — Fall Edition RSVP",
      description:
        "The Blacklist × MEPA present The Social Life Brunch, Fall Edition. Invitation-only brunch and day party at 18th & Vine, Sunday, October 11, 11:30 AM – 4 PM. Powered by HappiTime.",
      alternates: { canonical: "/sponsored-events/social-life-brunch/" },
      openGraph: {
        title: "The Social Life Brunch — Fall Edition",
        description:
          "Invitation-only brunch × day party. Sunday 10.11, 11:30 AM – 4 PM, 18th & Vine. RSVP for your seat.",
        url: "https://happitime.biz/sponsored-events/social-life-brunch/",
        images: [{ url: "/sponsored-events/social-life-brunch/portrait.jpg" }],
      },
    };

export default function SocialLifeBrunchPage() {
  const fonts = `${display.variable} ${sans.variable}`;
  return (
    <>
      <PageTracker pagePath="/sponsored-events/social-life-brunch/" />
      {POSTPONED ? <Postponed className={fonts} /> : <BrunchRsvp className={fonts} />}
    </>
  );
}
