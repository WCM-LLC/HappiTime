#!/usr/bin/env node
/**
 * validate-env.mjs
 *
 * Reads each app's .env.example, checks that every non-commented key has a
 * value in the matching .env.local (or process.env in CI). Exits non-zero if
 * any required key is missing. Commented keys (lines starting with #) and
 * blank lines are ignored.
 *
 * Some keys are required only in combination. A vision provider needs ONE of
 * two API keys, chosen by INTAKE_VISION_PROVIDER — demanding both would fail
 * every correct setup, and demanding neither is what let the intake feature
 * ship to production with no key at all. Declare those with a directive
 * comment in .env.example:
 *
 *   # @require-one-of KEY_A KEY_B [--when OTHER_KEY=val1,val2,unset]
 *
 * At least one listed key must have a value. With --when, the group applies
 * only if OTHER_KEY holds one of the listed values; `unset` is a legal value
 * and matches an absent or blank key, which is how a code-side default (the
 * route treats an absent provider as gemini) gets represented here.
 *
 * Usage: node scripts/validate-env.mjs
 * CI: set env vars in the environment; .env.local is optional.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = new URL("..", import.meta.url).pathname;

const ALL_APPS = [
  { name: "apps/web", example: "apps/web/.env.example", local: "apps/web/.env.local" },
  { name: "apps/mobile", example: "apps/mobile/.env.example", local: "apps/mobile/.env" },
  { name: "apps/directory", example: "apps/directory/.env.example", local: "apps/directory/.env.local" },
];

// Optional positional args: filter to specific app names (e.g. "apps/web")
const appFilter = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const APPS = appFilter.length > 0
  ? ALL_APPS.filter((a) => appFilter.includes(a.name))
  : ALL_APPS;

const DIRECTIVE = /^#\s*@require-one-of\s+(.+)$/;

/**
 * Extract `@require-one-of` groups from .env.example text.
 * Returns [{ keys: string[], when: { key, values } | null }].
 */
export function parseConditionalGroups(text) {
  const groups = [];
  for (const raw of text.split("\n")) {
    const m = DIRECTIVE.exec(raw.trim());
    if (!m) continue;
    const tokens = m[1].split(/\s+/).filter(Boolean);
    const whenIdx = tokens.indexOf("--when");
    const keys = (whenIdx === -1 ? tokens : tokens.slice(0, whenIdx)).filter(Boolean);
    if (keys.length === 0) continue;

    let when = null;
    if (whenIdx !== -1) {
      const cond = tokens[whenIdx + 1] ?? "";
      const eq = cond.indexOf("=");
      if (eq > 0) {
        when = {
          key: cond.slice(0, eq),
          values: cond
            .slice(eq + 1)
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean),
        };
      }
    }
    groups.push({ keys, when });
  }
  return groups;
}

const hasValue = (lookup, key) => {
  const v = lookup.get(key);
  return typeof v === "string" && v.trim() !== "";
};

/**
 * Which groups are in force but unsatisfied, given a Map<key, value>.
 * A group is satisfied when any of its keys has a non-blank value.
 */
export function unsatisfiedGroups(groups, lookup) {
  return groups.filter((g) => {
    if (g.when) {
      const actual = hasValue(lookup, g.when.key) ? lookup.get(g.when.key).trim() : "unset";
      if (!g.when.values.includes(actual)) return false; // group does not apply
    }
    return !g.keys.some((k) => hasValue(lookup, k));
  });
}

/** Parse key=value pairs from a .env file, returning a Map<key, value>. */
function parseEnvFile(filePath) {
  const map = new Map();
  if (!existsSync(filePath)) return map;
  const lines = readFileSync(filePath, "utf8").split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1).trim();
    if (key) map.set(key, value);
  }
  return map;
}

/** Extract required key names from a .env.example file.
 *  Keys are required if the line is not commented and the value is empty.
 *  Keys with a default value (non-empty right-hand side) are treated as optional.
 */
function parseExampleKeys(filePath) {
  const required = [];
  const optional = [];
  if (!existsSync(filePath)) return { required, optional };
  const lines = readFileSync(filePath, "utf8").split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1).trim();
    if (!key) continue;
    if (value === "") {
      required.push(key);
    } else {
      optional.push(key);
    }
  }
  return { required, optional };
}

function main() {
  let hasError = false;

  for (const app of APPS) {
    const examplePath = resolve(ROOT, app.example);
    const localPath = resolve(ROOT, app.local);

    if (!existsSync(examplePath)) {
      console.warn(`[validate-env] WARN: missing ${app.example} — skipping`);
      continue;
    }

    const { required } = parseExampleKeys(examplePath);
    const localVars = parseEnvFile(localPath);

    // One lookup for both checks. process.env wins so CI, which sets vars in
    // the environment rather than a file, validates the same way.
    const lookup = new Map(localVars);
    for (const [k, v] of Object.entries(process.env)) {
      if (v != null && v !== "") lookup.set(k, v);
    }

    const missing = [];
    for (const key of required) {
      const envValue = process.env[key] ?? localVars.get(key);
      if (!envValue || envValue.trim() === "") {
        missing.push(key);
      }
    }

    const groups = unsatisfiedGroups(
      parseConditionalGroups(readFileSync(examplePath, "utf8")),
      lookup,
    );

    if (missing.length > 0 || groups.length > 0) {
      console.error(`\n[validate-env] MISSING keys in ${app.name}:`);
      for (const key of missing) {
        console.error(`  - ${key}`);
      }
      for (const g of groups) {
        const cond = g.when
          ? ` (required when ${g.when.key} is ${g.when.values.join(" or ")})`
          : "";
        console.error(`  - one of: ${g.keys.join(", ")}${cond}`);
      }
      console.error(`  → Copy ${app.example} → ${app.local} and fill in the blanks.\n`);
      hasError = true;
    } else {
      console.log(`[validate-env] OK  ${app.name} (${required.length} required key${required.length !== 1 ? "s" : ""} present)`);
    }
  }

  if (hasError) {
    process.exit(1);
  }
}

// Only run as a CLI. The parsing helpers above are imported by tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
