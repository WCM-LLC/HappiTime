// supabase/functions/_shared/notification-copy.mjs
//
// The single voice for consumer-facing notification copy (push + inbox).
// Pure ESM so the Deno edge functions and CI's Node 20 tests both import it
// directly (cf. scan-message.mjs). Venue-team ops copy stays in
// scan-message.mjs on purpose — different audience, plain voice.
//
// Voice rules (locked by test/notification-copy.test.mjs):
//   titles lead with one emoji, no trailing punctuation; bodies are one
//   sentence ending in a period and never repeat the title's subject; times
//   are absolute 12-hour America/Chicago.

const someone = (name) => (name && String(name).trim()) || "Someone";
const aVenue = (name) => (name && String(name).trim()) || "a venue";

// "17:00" (already an America/Chicago wall-clock string) → "5:00 PM"
export function formatCentralClock(hhmm) {
  const [hStr, mStr] = String(hhmm).split(":");
  const h = Number(hStr);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${mStr} ${suffix}`;
}

// ISO instant → "5:00 PM" in America/Chicago (DST-safe via Intl)
export function formatCentralInstant(iso) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso)).toUpperCase();
}

export function followCopy(actorName) {
  return { title: "👋 New follower", body: `${someone(actorName)} started following you.` };
}

export function venueSaveCopy(actorName, venueName) {
  return {
    title: `🍸 ${someone(actorName)} saved ${aVenue(venueName)}`,
    body: "See what caught their eye.",
  };
}

export function itineraryShareCopy(actorName) {
  return {
    title: `📋 ${someone(actorName)} shared an itinerary`,
    body: "Open it to start planning.",
  };
}

export function happyHourPublishedCopy(venueName) {
  return {
    title: `🆕 New happy hour at ${aVenue(venueName)}`,
    body: "Just published — see times and specials.",
  };
}

export function happyHourUpdatedCopy(venueName) {
  return {
    title: `📝 ${aVenue(venueName)} updated their happy hour`,
    body: "See what changed.",
  };
}

export function happyHourStartingCopy(venueName, startClockHHMM, label) {
  const suffix = label && String(label).trim() ? ` · ${String(label).trim()}` : "";
  return {
    title: `🍹 Happy hour at ${aVenue(venueName)}`,
    body: `Starts at ${formatCentralClock(startClockHHMM)}${suffix}.`,
  };
}

export function eventStartingCopy(eventTitle, venueName, startsAtIso) {
  return {
    title: `🎟️ ${eventTitle}`,
    body: `Starts at ${formatCentralInstant(startsAtIso)} at ${aVenue(venueName)}.`,
  };
}

export function visitRatingCopy(venueName) {
  const name = (venueName && String(venueName).trim()) || "your visit";
  return { title: `⭐ How was ${name}?`, body: "Tap to rate your visit." };
}
