import type { Metadata } from "next";
import { ItineraryPageClient } from "./ItineraryPageClient";

export const metadata: Metadata = {
  title: "My Itinerary — Plan Your Happy Hour Crawl",
  description:
    "Your personal happy hour itinerary. Add venues, plan your route, and share with friends.",
};

export default function ItineraryPage() {
  return <ItineraryPageClient />;
}
