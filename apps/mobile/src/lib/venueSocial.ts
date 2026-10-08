// Screen-reader names for the venue contact/social icon strip.
//
// That strip is rendered in three places — the Home/Favorites card
// (components/HappyHourCard), the map's mini card (screens/MapScreen) and the
// detail sheet (screens/HappyHourDetailScreen) — at three different icon sizes
// and with three different style objects. The JSX legitimately differs; the
// NAMES must not, because a copper phone glyph is otherwise the only thing a
// VoiceOver or TalkBack user gets, and an unnamed icon button is announced as
// nothing at all.
//
// Only the name and the role live here. Geometry, colour and the `onPress`
// handler stay at the call site.

export type VenueSocialPlatform =
  | "phone"
  | "website"
  | "facebook"
  | "instagram"
  | "tiktok";

/**
 * Accessible name for one control in the strip.
 *
 * `venueName` is threaded through where the call site has it, because "Call
 * Broken Shaker" orients a screen-reader user inside a scrolling list of cards
 * in a way that a bare "Call" does not. Where the name is not in scope the
 * label still stands on its own.
 */
export function venueSocialLabel(
  platform: VenueSocialPlatform,
  venueName?: string | null
): string {
  const named = typeof venueName === "string" && venueName.trim().length > 0;
  const name = named ? venueName!.trim() : null;

  switch (platform) {
    case "phone":
      return name ? `Call ${name}` : "Call this venue";
    case "website":
      return name ? `Open the website for ${name}` : "Open the venue website";
    case "facebook":
      return name ? `Open ${name} on Facebook` : "Open this venue on Facebook";
    case "instagram":
      return name ? `Open ${name} on Instagram` : "Open this venue on Instagram";
    case "tiktok":
      return name ? `Open ${name} on TikTok` : "Open this venue on TikTok";
  }
}

/**
 * Role for one control in the strip.
 *
 * The four URL controls hand off to another app or the browser, which is what
 * "link" tells assistive tech; the phone control is a button because it opens
 * the dialer with a number rather than navigating to a destination.
 */
export function venueSocialRole(platform: VenueSocialPlatform): "button" | "link" {
  return platform === "phone" ? "button" : "link";
}
