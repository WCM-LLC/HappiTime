import type { Metadata } from "next";
import { Abril_Fatface, Archivo } from "next/font/google";
import { PageTracker } from "@/components/PageTracker";
import { BrunchRsvp } from "./BrunchRsvp";
import "./brunch.css";

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

export const metadata: Metadata = {
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
  return (
    <>
      <PageTracker pagePath="/sponsored-events/social-life-brunch/" />
      <BrunchRsvp className={`${display.variable} ${sans.variable}`} />
    </>
  );
}
