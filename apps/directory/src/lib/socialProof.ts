/**
 * Proof that has to come from real people — nothing in this file is invented,
 * and nothing should ever be. Both lists start EMPTY on purpose: the sections
 * that read them render nothing until a real entry is added, so the site never
 * shows a made-up quote or a made-up press mention.
 *
 * ── To publish a venue quote ────────────────────────────────────────────────
 * Get it in writing from the owner/manager, with permission to use their name.
 * The audit's ask: one line, a name, a role, and a specific outcome
 * ("we saw two extra tables on Thursdays"). Then add an entry:
 *
 *   {
 *     quote: "…their words, unedited…",
 *     name: "First Last",
 *     role: "Owner",
 *     venue: "Venue Name",
 *     venueSlug: "venue-slug",              // optional — links to their listing
 *     photo: "/proof/first-last.jpg",       // optional — file in apps/directory/public/proof/
 *   }
 *
 * ── To publish a press / third-party mention ────────────────────────────────
 *   { outlet: "Outlet name", title: "Headline", url: "https://…", date: "2026-11-03" }
 * Always dated: an "as seen in" strip with no date reads as filler.
 */

export type VenueQuote = {
  quote: string;
  name: string;
  role: string;
  venue: string;
  venueSlug?: string;
  photo?: string;
};

export type PressMention = {
  outlet: string;
  title: string;
  url: string;
  /** ISO date the piece ran, e.g. "2026-11-03". */
  date: string;
};

export const VENUE_QUOTES: VenueQuote[] = [];

export const PRESS_MENTIONS: PressMention[] = [];
