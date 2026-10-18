// The five bottom-tab glyphs — the only place in the app that needs a
// filled/outlined PAIR rather than a single glyph.
//
// WHY THIS IS NOT IconSymbol
//
// A tab bar has to say which destination is selected. Before this, it said so
// with tint alone: every tab rendered a `.fill` glyph in both states, and the
// `weight={focused ? "semibold" : "regular"}` passed alongside it did nothing,
// because icon-symbol.tsx accepted that prop and dropped it. Colour was the
// only difference between selected and unselected, which WCAG 2.1 1.4.1 asks
// us not to rely on, and which is invisible to anyone who cannot separate the
// two tints.
//
// It cannot be fixed inside IconSymbol, because IconSymbol maps onto
// MaterialIcons and MaterialIcons has no outlined `home` and no outlined `map`.
// (It does have `star-outline`, `notifications-none` and `person-outline` —
// three of the five — which is exactly the kind of near-miss that invites a
// half-done job.) MaterialCommunityIcons carries all five in both weights.
//
// It costs no additional font: components/ui/SocialIcon.tsx already imports
// MaterialCommunityIcons for the Facebook/Instagram/TikTok glyphs, so the
// family is in the bundle either way.
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { MainTabParamList } from "../../src/navigation/types";

type Glyphs = { filled: string; outlined: string };

/**
 * Keyed by route name, so adding a tab without giving it a pair is a type
 * error rather than a tab that silently falls back to colour-only selection.
 */
const TAB_GLYPHS: Record<keyof MainTabParamList, Glyphs> = {
  Home: { filled: "home", outlined: "home-outline" },
  Map: { filled: "map", outlined: "map-outline" },
  Favorites: { filled: "star", outlined: "star-outline" },
  Activity: { filled: "bell", outlined: "bell-outline" },
  Profile: { filled: "account-circle", outlined: "account-circle-outline" },
};

export function TabBarIcon({
  route,
  focused,
  color,
  size = 22,
}: {
  route: keyof MainTabParamList;
  focused: boolean;
  color: string;
  size?: number;
}) {
  const glyph = TAB_GLYPHS[route];
  return (
    <MaterialCommunityIcons
      name={(focused ? glyph.filled : glyph.outlined) as any}
      size={size}
      color={color}
      // The <Text> the tab label renders already names the destination, and
      // React Navigation builds the button's accessible name from it, so the
      // glyph must not announce itself a second time.
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}
