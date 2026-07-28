import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..");
const read = (rel) => readFileSync(join(repoRoot, rel), "utf8");

const page = read("apps/directory/src/app/start/page.tsx");
const opener = read("apps/directory/src/app/start/StartOpener.tsx");

// /start is take "1a — the clock leads" from the HappiTime Opener design canvas:
// a live KC clock and a two-door fork (drinkers vs. venue operators).

test("the doors navigate to the real pages, not mock panels", () => {
  assert.match(opener, /deals:\s*"\/kc\/"/, "the drinks door must open the real directory");
  assert.match(opener, /venues:\s*"\/pricing\/"/, "the pouring door must open the real pricing page");
});

test("no fabricated specials or prices from the design canvas survive", () => {
  // The canvas hardcoded invented happy hours against REAL named KC businesses,
  // and a $29/$79 tier list that contradicts the live $49/$99 pricing page.
  for (const invented of ["Extra Virgin", "Char Bar", "The Rieger", "Voltaire", "Harry's Country Club"]) {
    assert.doesNotMatch(
      page + opener,
      new RegExp(invented.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      `"${invented}" is a real business — its specials must come from live data, never a literal`
    );
  }
  for (const price of ["$29", "$79"]) {
    assert.doesNotMatch(
      page + opener,
      new RegExp(price.replace("$", "\\$")),
      `${price} contradicts the live pricing page`
    );
  }
});

test("every time calculation is in Kansas City time, not the visitor's", () => {
  // The headline literally reads "in Kansas City", so a visitor in Denver must
  // still be told KC's time. The design's original used visitor-local time.
  assert.match(page, /America\/Chicago/);
  assert.match(opener, /America\/Chicago/);
  assert.doesNotMatch(opener, /new Date\(\)\.getHours\(\)/, "getHours() is visitor-local");
});

test("the headline copy defers to live data before falling back to hour buckets", () => {
  // Regression: at 7am the hour bucket claimed "Nothing is pouring yet" directly
  // above a ticker listing an active happy hour.
  const fn = opener.slice(opener.indexOf("function timeCopy"));
  const body = fn.slice(0, fn.indexOf("\nfunction "));
  assert.ok(
    body.indexOf("liveCount > 0") < body.indexOf("Nothing is pouring yet"),
    "the live-count branch must precede the hour buckets"
  );
});

test("the opener stays out of the index while / still serves the directory", () => {
  // Two entry points competing for the same terms reads as a doorway page.
  assert.match(page, /robots:\s*\{\s*index:\s*false/);
});

test("motion-sensitive visitors skip the transition instead of waiting", () => {
  assert.match(opener, /prefers-reduced-motion/);
  const go = opener.slice(opener.indexOf("const go = useCallback"));
  assert.ok(
    go.indexOf("prefersReducedMotion()") < go.indexOf("setPressing"),
    "the reduced-motion path must bail out before starting the animation"
  );
});
