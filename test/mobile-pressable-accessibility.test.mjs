// test/mobile-pressable-accessibility.test.mjs
//
// Every <Pressable> in apps/mobile/src must carry an accessibilityRole and must
// have an accessible name.
//
// WHY THIS EXISTS: before 2026-10-07, 146 of the app's 177 Pressables had no
// accessibilityRole and 29 had no accessible name at all — no label, and no
// <Text> child to borrow one from. The 29 were the icon-only controls: the
// venue phone/website/social strip (rendered three times over at three sizes),
// the map recenter and dismiss buttons, the two favourite hearts, and six modal
// scrims. A screen-reader user reached a copper glyph that announced nothing.
//
// Those were fixed one at a time. This test is what stops them coming back,
// because nothing else in CI can see them: `npm run typecheck` is perfectly
// happy with an unnamed button, and `npm run lint` has no rule for it.
//
// WHAT THIS TEST IS: a static guard that each tappable element declares a role
// and has *some* name. It reads source text.
//
// WHAT THIS TEST IS NOT: a check that the names are any good. "Open the website
// for Broken Shaker" and "Button" both pass. It cannot evaluate a name built
// from a runtime expression, it does not render anything, and it says nothing
// about focus order, contrast, or hit-target size. A label that reads wrong to
// a human still needs a human — or a VoiceOver pass — to catch.
//
// It also only covers <Pressable>. That is currently the app's only touchable
// (there are no TouchableOpacity call sites), and the test asserts that too, so
// that reintroducing one does not quietly open an unguarded path.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const srcRoot = join(repoRoot, "apps/mobile/src");

function tsxFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...tsxFiles(full));
    else if (entry.endsWith(".tsx")) out.push(full);
  }
  return out.sort();
}

/**
 * Find the end of a JSX opening tag that starts at `start`.
 *
 * A naive search for the next ">" is wrong here, and was wrong in the first
 * draft of the script that produced these fixes: these tags carry props like
 * `style={({ pressed }) => [...]}` and `onPress={() => Linking.openURL(`tel:${x}`)}`,
 * so ">" and "/>" occur inside arrow functions, template literals and strings
 * long before the tag closes. Track brace depth and quote state instead.
 */
function findTagEnd(src, start) {
  let i = start + "<Pressable".length;
  let brace = 0;
  let quote = null;
  for (; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      continue;
    }
    if (c === "{") brace++;
    else if (c === "}") brace--;
    else if (brace === 0 && c === "/" && src[i + 1] === ">") {
      return { tagEnd: i + 2, selfClosing: true };
    } else if (brace === 0 && c === ">") {
      return { tagEnd: i + 1, selfClosing: false };
    }
  }
  return { tagEnd: src.length, selfClosing: false };
}

/** Every <Pressable> in `src`, with its opening tag and its children. */
function findPressables(src) {
  const out = [];
  const open = /<Pressable(?=[\s/>])/g;
  let m;
  while ((m = open.exec(src))) {
    const tagStart = m.index;
    const { tagEnd, selfClosing } = findTagEnd(src, tagStart);
    let children = "";
    if (!selfClosing) {
      // Walk to the matching </Pressable>, skipping over nested ones.
      const tok = /<Pressable(?=[\s/>])|<\/Pressable>/g;
      tok.lastIndex = tagEnd;
      let depth = 0;
      let closeAt = src.length;
      let t;
      while ((t = tok.exec(src))) {
        if (t[0] === "</Pressable>") {
          if (depth === 0) {
            closeAt = t.index;
            break;
          }
          depth--;
        } else if (!findTagEnd(src, t.index).selfClosing) {
          depth++;
        }
      }
      children = src.slice(tagEnd, closeAt);
    }
    out.push({
      line: src.slice(0, tagStart).split("\n").length,
      attrs: src.slice(tagStart, tagEnd),
      children,
    });
  }
  return out;
}

const files = tsxFiles(srcRoot);

test("apps/mobile has source files to scan", () => {
  // Guard against the scan silently passing because it found nothing — the
  // failure mode that makes a static test worthless.
  assert.ok(files.length > 20, `expected to find mobile .tsx files, found ${files.length}`);
  const total = files.reduce((n, f) => n + findPressables(readFileSync(f, "utf8")).length, 0);
  assert.ok(total > 100, `expected to parse many Pressables, parsed ${total}`);
});

test("every Pressable declares an accessibilityRole", () => {
  const missing = [];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    for (const p of findPressables(src)) {
      if (!/\baccessibilityRole\s*=/.test(p.attrs)) {
        missing.push(`${relative(repoRoot, file)}:${p.line}`);
      }
    }
  }
  assert.deepEqual(
    missing,
    [],
    `Pressables without accessibilityRole — assistive tech will not announce ` +
      `these as actionable:\n  ${missing.join("\n  ")}`
  );
});

test("every Pressable has an accessible name", () => {
  const nameless = [];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    for (const p of findPressables(src)) {
      const hasLabel = /\baccessibilityLabel\s*=/.test(p.attrs);
      // A <Text> child supplies the name when no explicit label is set.
      const hasTextChild = /<Text[\s>]/.test(p.children);
      if (!hasLabel && !hasTextChild) {
        nameless.push(`${relative(repoRoot, file)}:${p.line}`);
      }
    }
  }
  assert.deepEqual(
    nameless,
    [],
    `Pressables with no accessible name — these render only an icon or an ` +
      `image, so they need an explicit accessibilityLabel:\n  ${nameless.join("\n  ")}`
  );
});

// ── The one set of names this test CAN check for content ─────────────────────
// The scan above cannot read a name built from a runtime expression, and 15 of
// the 29 hand-written labels are exactly that: venueSocialLabel(platform, name)
// for the contact strip. That helper is pure, so mirror it here per repo
// convention (node:test can't import the app's TS) with a drift guard below.
function venueSocialLabel(platform, venueName) {
  const named = typeof venueName === "string" && venueName.trim().length > 0;
  const name = named ? venueName.trim() : null;
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

const SOCIAL_PLATFORMS = ["phone", "website", "facebook", "instagram", "tiktok"];

test("every contact-strip control gets a non-empty, distinct name", () => {
  for (const withName of ["Broken Shaker", null, "", "   "]) {
    const labels = SOCIAL_PLATFORMS.map((p) => venueSocialLabel(p, withName));
    for (const label of labels) {
      assert.equal(typeof label, "string");
      assert.ok(label.trim().length > 0, `empty label for ${withName}`);
      // A name that still contains the interpolation marker means a venue with
      // no name produced "Open the website for null".
      assert.ok(!/\bnull\b|\bundefined\b/.test(label), `leaked empty name: ${label}`);
    }
    assert.equal(
      new Set(labels).size,
      SOCIAL_PLATFORMS.length,
      `five controls sit side by side; their names must differ: ${labels.join(" / ")}`
    );
  }
});

test("a blank venue name falls back rather than naming an empty venue", () => {
  assert.equal(venueSocialLabel("phone", "   "), "Call this venue");
  assert.equal(venueSocialLabel("phone", "Broken Shaker"), "Call Broken Shaker");
  // Surrounding whitespace in the venue record should not reach the label.
  assert.equal(venueSocialLabel("website", "  Lost Lake  "), "Open the website for Lost Lake");
});

test("the mirrored label helper has not drifted from the real source", () => {
  const real = readFileSync(join(srcRoot, "lib/venueSocial.ts"), "utf8");
  for (const platform of SOCIAL_PLATFORMS) {
    assert.ok(
      new RegExp(`case "${platform}":`).test(real),
      `venueSocial.ts no longer handles "${platform}"`
    );
  }
  // Spot-check the exact strings the mirror claims, so a reworded label in the
  // source fails here instead of silently passing against a stale copy.
  for (const expected of [
    "Call ${name}",
    "Call this venue",
    "Open the website for ${name}",
    "Open ${name} on Facebook",
    "Open ${name} on Instagram",
    "Open ${name} on TikTok",
  ]) {
    assert.ok(real.includes(expected), `venueSocial.ts no longer produces: ${expected}`);
  }
  // The phone control is a button; the four that leave the app are links.
  assert.match(real, /platform === "phone" \? "button" : "link"/);
});

test("Pressable is still the only touchable, so this scan covers them all", () => {
  const others = [];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    for (const name of [
      "TouchableOpacity",
      "TouchableHighlight",
      "TouchableWithoutFeedback",
      "TouchableNativeFeedback",
    ]) {
      if (new RegExp(`<${name}(?=[\\s/>])`).test(src)) {
        others.push(`${relative(repoRoot, file)}: <${name}>`);
      }
    }
  }
  assert.deepEqual(
    others,
    [],
    `This test only inspects <Pressable>. Another touchable appeared, so it is ` +
      `no longer covering every tappable element — extend the scan:\n  ${others.join("\n  ")}`
  );
});
