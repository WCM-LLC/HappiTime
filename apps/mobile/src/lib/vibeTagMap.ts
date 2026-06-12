// Translates the curated onboarding vibe keys (VibePickerScreen.tsx) into the
// canonical approved_tags slugs the feed filter and user_preferences.interests
// use. The onboarding keys are short/marketing-friendly ("late", "margs"); the
// taxonomy is hyphenated ("late-night", "margaritas"). Keep this in sync with
// the VIBES array and the approved_tags table.
export const VIBE_TO_TAG_SLUG: Record<string, string> = {
  "dive": "dive-bar",
  "cocktails": "cocktail-bar",
  "patio": "patio",
  "rooftop": "rooftop",
  "sports": "sports-bar",
  "late": "late-night",
  "brewery": "brewery",
  "margs": "margaritas",
  "wine": "wine-bar",
};

/** Maps onboarding vibe keys to approved_tags slugs, dropping any unknown key. */
export function vibesToTagSlugs(vibes: string[]): string[] {
  const out: string[] = [];
  for (const v of vibes) {
    const slug = VIBE_TO_TAG_SLUG[v];
    if (slug && !out.includes(slug)) out.push(slug);
  }
  return out;
}
