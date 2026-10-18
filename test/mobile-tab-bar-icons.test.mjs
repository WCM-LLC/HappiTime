// test/mobile-tab-bar-icons.test.mjs
//
// The bottom tab bar must signal the selected destination with more than tint.
//
// WHY THIS EXISTS: until 2026-10-09 every tab rendered a `.fill` glyph in both
// states, and `tabBarIcon` passed `weight={focused ? "semibold" : "regular"}`
// to a component that accepted `weight` and discarded it — MaterialIcons is a
// single-weight font, so the prop could never have worked. The only difference
// between the selected tab and the other four was colour, which WCAG 2.1 1.4.1
// asks us not to rely on.
//
// WHAT THIS TEST IS: a static check that each tab declares a DISTINCT pair of
// glyphs, that every glyph name actually exists in the font it will be looked
// up in, and that the discarded `weight` prop has not come back.
//
// The glyph-name check is the valuable half. A misspelled icon name in
// react-native-vector-icons does not throw — it renders a blank box, or on
// some platforms a "?" — so a typo ships silently and only a human looking at
// the running app would notice. Reading the real glyphmap JSON out of
// node_modules is the only way to catch it before then.
//
// WHAT THIS TEST IS NOT: proof the icons look right, are the right metaphor, or
// are distinguishable at 22px to a particular person. It checks that two
// different glyphs are requested and that both exist.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const read = (rel) => readFileSync(join(repoRoot, rel), "utf8");

const GLYPHMAPS = "node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps";
const materialIcons = JSON.parse(read(`${GLYPHMAPS}/MaterialIcons.json`));
const materialCommunity = JSON.parse(read(`${GLYPHMAPS}/MaterialCommunityIcons.json`));

const tabSource = read("apps/mobile/components/ui/tab-bar-icon.tsx");
const navSource = read("apps/mobile/src/navigation/AppNavigator.tsx");
const iconSource = read("apps/mobile/components/ui/icon-symbol.tsx");
const typesSource = read("apps/mobile/src/navigation/types.ts");

/** The TAB_GLYPHS object, parsed from source (no TS import available here). */
function tabGlyphs() {
  const block = /const TAB_GLYPHS[^=]*=\s*\{([\s\S]*?)\n\};/.exec(tabSource);
  assert.ok(block, "TAB_GLYPHS not found in tab-bar-icon.tsx");
  const out = {};
  for (const m of block[1].matchAll(
    /(\w+):\s*\{\s*filled:\s*"([^"]+)",\s*outlined:\s*"([^"]+)"\s*\}/g
  )) {
    out[m[1]] = { filled: m[2], outlined: m[3] };
  }
  return out;
}

/** Route names declared in MainTabParamList. */
function tabRoutes() {
  const block = /export type MainTabParamList = \{([\s\S]*?)\n\};/.exec(typesSource);
  assert.ok(block, "MainTabParamList not found");
  return [...block[1].matchAll(/^\s{2}(\w+)[?]?:/gm)].map((m) => m[1]);
}

test("the glyphmaps load and look sane", () => {
  // Guard against the whole suite passing because a path changed and every
  // lookup silently became "not found" against an empty object.
  assert.ok(Object.keys(materialIcons).length > 1000);
  assert.ok(Object.keys(materialCommunity).length > 1000);
  assert.ok("home" in materialCommunity && "home-outline" in materialCommunity);
});

test("every tab route has a glyph pair", () => {
  const glyphs = tabGlyphs();
  const routes = tabRoutes();
  assert.ok(routes.length >= 5, `expected the five tabs, parsed ${routes.join(", ")}`);
  for (const route of routes) {
    assert.ok(
      glyphs[route],
      `tab "${route}" has no entry in TAB_GLYPHS — it would fall back to ` +
        `colour-only selection`
    );
  }
});

test("selected and unselected use DIFFERENT glyphs", () => {
  // This is the defect itself. Equal names here means the tab bar is back to
  // signalling selection with tint alone.
  for (const [route, { filled, outlined }] of Object.entries(tabGlyphs())) {
    assert.notEqual(
      filled,
      outlined,
      `tab "${route}" uses "${filled}" in both states, so only its colour changes`
    );
  }
});

test("every tab glyph name exists in the MaterialCommunityIcons font", () => {
  // A misspelled name renders a blank box at runtime without throwing.
  for (const [route, { filled, outlined }] of Object.entries(tabGlyphs())) {
    for (const [state, name] of [["filled", filled], ["outlined", outlined]]) {
      assert.ok(
        name in materialCommunity,
        `tab "${route}" ${state} glyph "${name}" is not in MaterialCommunityIcons — ` +
          `it will render as an empty box`
      );
    }
  }
});

test("every IconSymbol mapping resolves to a real MaterialIcons glyph", () => {
  const block = /const MAPPING = \{([\s\S]*?)\} as const;/.exec(iconSource);
  assert.ok(block, "MAPPING not found in icon-symbol.tsx");
  const entries = [...block[1].matchAll(/^\s*'([^']+)':\s*'([^']+)',/gm)];
  assert.ok(entries.length > 15, `parsed only ${entries.length} mappings`);
  for (const [, sfName, materialName] of entries) {
    assert.ok(
      materialName in materialIcons,
      `IconSymbol maps "${sfName}" to "${materialName}", which is not a ` +
        `MaterialIcons glyph — it will render as an empty box`
    );
  }
});

test("the tab bar uses TabBarIcon, and the discarded weight prop stays gone", () => {
  assert.match(navSource, /<TabBarIcon\b/, "AppNavigator no longer renders TabBarIcon");
  assert.ok(
    !/\bweight=/.test(navSource),
    "AppNavigator passes `weight` again — MaterialIcons is single-weight, so it " +
      "does nothing; selection state belongs in the glyph pair"
  );
  // The prop must not reappear on IconSymbol's public shape either.
  const props = /export function IconSymbol\(\{[\s\S]*?\}: \{([\s\S]*?)\}\) \{/.exec(iconSource);
  assert.ok(props, "could not parse IconSymbol's props");
  assert.ok(
    !/\bweight\??:/.test(props[1]),
    "IconSymbol declares a `weight` prop again; it cannot honour one"
  );
});

test("the SF Symbols claim is only made if something actually renders them", () => {
  // The Expo template's docstring said the component "uses native SF Symbols on
  // iOS". There is no icon-symbol.ios.tsx and expo-symbols is not a dependency,
  // so for this app that was false — and it was quoted back at me as fact
  // during an audit before I checked it.
  //
  // Phrased as an implication rather than a ban, so it keeps its meaning if
  // expo-symbols is adopted later: the claim is allowed exactly when the two
  // things that would make it true are present.
  const claimsSfSymbols = /uses native SF Symbols on iOS/.test(iconSource);
  if (!claimsSfSymbols) return;

  const pkg = JSON.parse(read("apps/mobile/package.json"));
  assert.ok(
    "expo-symbols" in (pkg.dependencies ?? {}),
    "icon-symbol.tsx claims to render native SF Symbols, but expo-symbols is " +
      "not a dependency of apps/mobile"
  );
  assert.ok(
    existsSync(join(repoRoot, "apps/mobile/components/ui/icon-symbol.ios.tsx")),
    "icon-symbol.tsx claims to render native SF Symbols on iOS, but there is " +
      "no icon-symbol.ios.tsx — the shared file maps onto MaterialIcons"
  );
});
