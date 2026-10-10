// test/mobile-palette-contrast.test.mjs
//
// The mobile palette's contrast claims, computed rather than asserted in a
// comment.
//
// WHY THIS EXISTS: apps/mobile/src/theme/colors.ts now documents which token
// pairs with which — "copper is a fill, its label is onPrimary", "the mid
// semantic tones are not type, the -ink variants are". Those claims were true
// when written. A comment cannot stay true on its own, and the app had already
// drifted a long way from its own stated palette: white on copper at 2.64:1
// across 37 button labels, copper as body type at 2.64:1 across 42 styles, a
// `textMutedLight` at 2.43:1, and a tab bar whose labels were 2.16:1.
//
// WHAT THIS TEST IS: the WCAG 2.1 relative-luminance formula applied to the
// real hex values read out of colors.ts, checked against the floor for the role
// each pair is actually used in — 4.5:1 for text (1.4.3), 3:1 for a UI
// boundary or an informational icon (1.4.11).
//
// WHAT THIS TEST IS NOT: a guarantee the app is readable. It checks the pairs
// listed here. It cannot tell that a token is being used on a ground nobody
// paired it with, it knows nothing about text over photography (the hero
// images behind the tier badge), and contrast is only one axis of legibility —
// 10px uppercase type can clear 7:1 and still be hard to read.
//
// It also deliberately asserts the FAILING value of each pairing that was
// replaced. If someone reverts `onPrimary` to white, the "before" assertion
// starts passing and this file says so, rather than going quiet.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
  join(__dirname, "../apps/mobile/src/theme/colors.ts"),
  "utf8"
);

/** Read `name: "#RRGGBB",` straight out of the theme source. */
function token(name) {
  const m = new RegExp(`\\b${name}:\\s*"(#[0-9A-Fa-f]{6})"`).exec(source);
  assert.ok(m, `token ${name} not found in colors.ts`);
  return m[1];
}

// WCAG 2.1 relative luminance and contrast ratio.
function channel(eight) {
  const c = eight / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  );
}
function ratio(a, b) {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const TEXT = 4.5; // WCAG 2.1 AA, text under 18.66px regular
const UI = 3.0; // WCAG 2.1 AA, non-text contrast

function atLeast(fg, bg, floor, what) {
  const got = ratio(fg, bg);
  assert.ok(
    got >= floor,
    `${what}: ${fg} on ${bg} is ${got.toFixed(2)}:1, under the ${floor}:1 floor`
  );
}
function below(fg, bg, floor, what) {
  const got = ratio(fg, bg);
  assert.ok(
    got < floor,
    `${what}: ${fg} on ${bg} is now ${got.toFixed(2)}:1, at or over ${floor}:1 — ` +
      `if this pairing became usable, update the palette's reasoning and this test`
  );
}

test("the contrast maths matches a known reference pair", () => {
  // Sanity-check the implementation before trusting it: black on white is
  // exactly 21:1 and white on white exactly 1:1 by definition.
  assert.equal(Math.round(ratio("#000000", "#FFFFFF")), 21);
  assert.equal(Math.round(ratio("#FFFFFF", "#FFFFFF")), 1);
});

test("copper is a fill, and its label is graphite", () => {
  atLeast(token("onPrimary"), token("primary"), TEXT, "onPrimary on primary");
  // The reason onPrimary exists.
  below("#FFFFFF", token("primary"), TEXT, "white on primary");
});

test("copper as type on a light ground uses brandDark", () => {
  atLeast(token("brandDark"), token("surface"), TEXT, "brandDark on surface");
  atLeast(token("brandDark"), token("background"), TEXT, "brandDark on background");
  atLeast(token("brandDark"), token("brandSubtle"), TEXT, "brandDark on brandSubtle");
  below(token("primary"), token("surface"), TEXT, "primary as type on surface");
  // primaryDark is explicitly documented as borders-and-fills only.
  atLeast(token("primaryDark"), token("surface"), UI, "primaryDark as a boundary");
  below(token("primaryDark"), token("surface"), TEXT, "primaryDark as type");
});

test("both text tiers are readable on every ground they are used on", () => {
  for (const ground of ["surface", "background", "cream", "inputBackground"]) {
    atLeast(token("text"), token(ground), TEXT, `text on ${ground}`);
    atLeast(token("textMuted"), token(ground), TEXT, `textMuted on ${ground}`);
  }
  // The retired third tier. If it comes back, it has to come back readable.
  assert.ok(
    !/^\s*textMutedLight:/m.test(source),
    "textMutedLight is back in colors.ts — it was 2.43:1 and failed in every " +
      "role it was used in (text, placeholder and icon)"
  );
  assert.ok(
    !/^\s*inputPlaceholder:/m.test(source),
    "inputPlaceholder is back in colors.ts — it held textMutedLight's hex"
  );
});

test("the tab bar, which is on every screen, is readable", () => {
  atLeast(token("tabBarActiveTint"), token("tabBarBackground"), TEXT, "active tab label");
  atLeast(token("tabBarInactiveTint"), token("tabBarBackground"), TEXT, "inactive tab label");
});

test("the semantic mid tones are not type; the ink variants are", () => {
  atLeast(token("successInk"), token("successLight"), TEXT, "successInk on successLight");
  atLeast(token("successInk"), token("surface"), TEXT, "successInk on surface");
  atLeast(token("warningInk"), token("warningLight"), TEXT, "warningInk on warningLight");
  atLeast(token("error"), token("surface"), TEXT, "error on surface");
  atLeast(token("error"), token("errorLight"), TEXT, "error on errorLight");
  below(token("success"), token("successLight"), TEXT, "success as type on successLight");
  below(token("warning"), token("warningLight"), TEXT, "warning as type on warningLight");
});

test("the dark surfaces use their own foreground tokens", () => {
  for (const ground of ["dark", "darkSurface", "pillActiveBg"]) {
    atLeast(token("darkForeground"), token(ground), TEXT, `darkForeground on ${ground}`);
    atLeast(token("darkMuted"), token(ground), TEXT, `darkMuted on ${ground}`);
  }
  atLeast(token("pillActiveText"), token("pillActiveBg"), TEXT, "pill label");
  // Copper IS readable on near-black, which is why the three dark-ground
  // controls in the app were left on `primary` rather than moved to brandDark —
  // brandDark would have been 3.32:1 there.
  atLeast(token("primary"), token("dark"), TEXT, "primary on dark");
  below(token("brandDark"), token("dark"), TEXT, "brandDark on dark");
});

test("each tier badge is readable and each tier card boundary is visible", () => {
  // tierColors is a structure, not flat tokens, so read the mapping it declares.
  const tier = /export const tierColors = \{([\s\S]*?)\n\} as const;/.exec(source);
  assert.ok(tier, "tierColors block not found");
  const body = tier[1];

  for (const [name, expected] of [
    ["featured", { badge: "wine", badgeText: "surface", bg: "wineSubtle", border: "wine" }],
    ["verified", { badge: "primary", badgeText: "onPrimary", bg: "brandSubtle", border: "primaryDark" }],
  ]) {
    const entry = new RegExp(`${name}:\\s*\\{([\\s\\S]*?)\\n  \\},`).exec(body);
    assert.ok(entry, `tierColors.${name} not found`);
    for (const [slot, want] of Object.entries(expected)) {
      assert.match(
        entry[1],
        new RegExp(`${slot}:\\s*colors\\.${want}\\b`),
        `tierColors.${name}.${slot} should be colors.${want}`
      );
    }
    atLeast(token(expected.badgeText), token(expected.badge), TEXT, `${name} badge label`);
    atLeast(token(expected.border), token(expected.bg), UI, `${name} card boundary`);
  }

  // Verified is Golden Hour and Featured is Oxblood, matching the console's
  // apps/web/src/utils/tier-style.ts. They were the other way round, and
  // Verified was a stock blue that is not in the palette at all.
  assert.match(body, /verified:[\s\S]*?badge:\s*colors\.primary\b/);
  assert.match(body, /featured:[\s\S]*?badge:\s*colors\.wine\b/);
  for (const dead of ["promoPremium", "promoBasic", "promoFeatured", "promoVerified"]) {
    // A declaration, not a mention: colors.ts explains in prose why these were
    // removed, and that prose must not trip the guard.
    assert.ok(
      !new RegExp(`^\\s*${dead}\\w*\\s*:`, "m").test(source),
      `${dead}* is declared again in colors.ts — the tier mapping lives in ` +
        `tierColors now, as one declaration, so the hues cannot disagree with ` +
        `themselves`
    );
  }
});

test("the console and the app agree on the tier hues", () => {
  // The two surfaces show the same `promotion_tier` under the same labels, so
  // a venue must not be oxblood in one and copper in the other.
  const web = readFileSync(
    join(__dirname, "../apps/web/src/utils/tier-style.ts"),
    "utf8"
  );
  assert.match(
    web,
    /verified:\s*'bg-brand-subtle/,
    "the console no longer renders Verified in the brand copper; mobile's " +
      "tierColors.verified still does, so one of them has moved"
  );
  assert.match(
    web,
    /featured:\s*'bg-wine-subtle/,
    "the console no longer renders Featured in wine; mobile's " +
      "tierColors.featured still does, so one of them has moved"
  );
});
