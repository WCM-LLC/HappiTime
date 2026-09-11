// test/validate-env-conditional.test.mjs
//
// The intake outage on 2026-08-13 was a missing GOOGLE_AI_API_KEY in Vercel.
// validate-env.mjs never flagged it, because the key is commented out in
// apps/web/.env.example and the validator only requires uncommented keys with
// empty values.
//
// Uncommenting is not the fix: the Gemini key is required only when
// INTAKE_VISION_PROVIDER is gemini (the code default), and the Anthropic key
// only when it is anthropic. Demanding both would fail every correct setup.
//
// So the validator learns one new idea — a group of keys where at least one
// must be set, optionally gated on another key's value:
//
//   # @require-one-of GOOGLE_AI_API_KEY GEMINI_API_KEY --when INTAKE_VISION_PROVIDER=gemini,unset
//
// `unset` is a legal condition value, and it carries the weight here: an
// absent INTAKE_VISION_PROVIDER means gemini, which is exactly the production
// configuration that broke.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  parseConditionalGroups,
  unsatisfiedGroups,
} from "../scripts/validate-env.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

test("a bare group requires at least one member to be set", () => {
  const [group] = parseConditionalGroups("# @require-one-of KEY_A KEY_B\n");
  assert.deepEqual(group.keys, ["KEY_A", "KEY_B"]);
  assert.equal(group.when, null);

  assert.deepEqual(unsatisfiedGroups([group], new Map([["KEY_B", "x"]])), []);
  assert.deepEqual(unsatisfiedGroups([group], new Map([["KEY_A", "x"]])), []);
  // Neither set — the whole point of the group.
  assert.deepEqual(unsatisfiedGroups([group], new Map()), [group]);
});

test("an empty value does not satisfy a group", () => {
  // A key present but blank is the shape a half-finished .env.local takes,
  // and it must not read as configured.
  const [group] = parseConditionalGroups("# @require-one-of KEY_A KEY_B\n");
  assert.deepEqual(unsatisfiedGroups([group], new Map([["KEY_A", "   "]])), [group]);
});

test("--when gates the group on another key's value", () => {
  const [group] = parseConditionalGroups(
    "# @require-one-of ANTHROPIC_API_KEY --when PROVIDER=anthropic\n",
  );
  assert.deepEqual(group.when, { key: "PROVIDER", values: ["anthropic"] });

  // Condition met, key absent -> unsatisfied.
  assert.deepEqual(
    unsatisfiedGroups([group], new Map([["PROVIDER", "anthropic"]])),
    [group],
  );
  // Condition not met -> the group does not apply at all. This is what keeps
  // an anthropic setup from being told it needs a Gemini key.
  assert.deepEqual(unsatisfiedGroups([group], new Map([["PROVIDER", "gemini"]])), []);
});

test("`unset` matches an absent or blank condition key", () => {
  // The production failure in one assertion: no INTAKE_VISION_PROVIDER set,
  // so the code defaults to gemini, so a Gemini key is required.
  const [group] = parseConditionalGroups(
    "# @require-one-of GOOGLE_AI_API_KEY GEMINI_API_KEY --when INTAKE_VISION_PROVIDER=gemini,unset\n",
  );
  assert.deepEqual(group.when.values, ["gemini", "unset"]);

  assert.deepEqual(unsatisfiedGroups([group], new Map()), [group], "absent = gemini = key required");
  assert.deepEqual(
    unsatisfiedGroups([group], new Map([["INTAKE_VISION_PROVIDER", ""]])),
    [group],
    "blank counts as unset",
  );
  assert.deepEqual(
    unsatisfiedGroups([group], new Map([["GOOGLE_AI_API_KEY", "k"]])),
    [],
    "key present satisfies it",
  );
  assert.deepEqual(
    unsatisfiedGroups([group], new Map([["INTAKE_VISION_PROVIDER", "anthropic"]])),
    [],
    "a different provider lifts the requirement",
  );
});

test("non-directive comments and prose are ignored", () => {
  const groups = parseConditionalGroups(
    [
      "# Vision provider: 'gemini' (default, free tier) or 'anthropic'.",
      "# INTAKE_VISION_PROVIDER=gemini",
      "# @require-one-of KEY_A",
      "SOME_KEY=",
    ].join("\n"),
  );
  assert.equal(groups.length, 1, "only the @require-one-of line is a directive");
});

test("apps/web/.env.example declares the vision-key requirement", () => {
  // The regression guard: this is the file whose silence caused the outage.
  const example = readFileSync(join(repoRoot, "apps/web/.env.example"), "utf8");
  const groups = parseConditionalGroups(example);

  const gemini = groups.find((g) => g.keys.includes("GOOGLE_AI_API_KEY"));
  assert.ok(gemini, "the Gemini key must be declared in a require-one-of group");
  assert.deepEqual(gemini.when, {
    key: "INTAKE_VISION_PROVIDER",
    values: ["gemini", "unset"],
  });

  const anthropic = groups.find((g) => g.keys.includes("ANTHROPIC_API_KEY"));
  assert.ok(anthropic, "the Anthropic key must be declared too");
  assert.deepEqual(anthropic.when, {
    key: "INTAKE_VISION_PROVIDER",
    values: ["anthropic"],
  });

  // And the whole point: a config with no provider and no key must fail.
  assert.deepEqual(
    unsatisfiedGroups(groups, new Map()).map((g) => g.keys[0]),
    ["GOOGLE_AI_API_KEY"],
    "the exact production misconfiguration must be reported",
  );
});
