// test/mobile-android-dependency-parity.test.mjs
//
// apps/android is the Android build workspace — it owns the package id, the
// Android permissions, the EAS build profiles and the Play Console notes — but
// it is not a codebase: its App.tsx is `export { default } from "../mobile/App"`.
// The screens all live in apps/mobile.
//
// WHAT THIS TEST IS: hygiene. A workspace that builds an app should declare the
// packages that app's code imports, and the two workspaces should agree on
// versions since they load one hoisted node_modules tree.
//
// WHAT THIS TEST IS NOT: a guard against a broken Android build. An earlier
// version of this file claimed that a package missing from apps/android's
// package.json would not be linked into the binary, and that the Happy Hour
// scan had therefore "never worked on Android". That was wrong, and a beta
// build disproved it on 2026-08-14 by completing a scan end to end.
//
// The reasoning error: Expo autolinking resolves native modules by scanning
// node_modules search paths, NOT by reading the build workspace's declared
// dependencies. On a clean install the package hoists to the monorepo root,
// where autolinking finds it regardless of which workspace declared it. The
// original claim was extrapolated from one laptop's node_modules layout, where
// expo-image-picker happened to sit nested under apps/mobile.
//
// So: keep these assertions, because declared dependencies should match
// imports and version drift between two apps sharing one tree is a real
// hazard. Do not read a failure here as "Android is broken" — read it as
// "apps/android's manifest has drifted from the code it ships".

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

const mobilePkg = JSON.parse(readFileSync(join(repoRoot, "apps/mobile/package.json"), "utf8"));
const androidPkg = JSON.parse(readFileSync(join(repoRoot, "apps/android/package.json"), "utf8"));

/**
 * The files Metro actually bundles for Android, by reachability from the app
 * entry point — not merely "every file without a .ios suffix".
 *
 * That distinction matters: lib/appleNonce.ts imports expo-crypto and carries
 * no platform suffix, but its only importer is AppleSignInButton.ios.tsx, so
 * Android never loads it. A filename-only rule would demand Android declare
 * expo-crypto, which it genuinely does not need.
 */
function androidReachableFiles(entry) {
  const resolve = (fromFile, spec) => {
    if (!spec.startsWith(".")) return null;
    const base = join(dirname(fromFile), spec);
    // Android resolution order: .android.* wins, .ios.* is never considered.
    for (const c of [
      `${base}.android.tsx`, `${base}.android.ts`,
      `${base}.tsx`, `${base}.ts`,
      join(base, "index.tsx"), join(base, "index.ts"),
    ]) {
      try {
        if (statSync(c).isFile()) return c;
      } catch {
        /* keep looking */
      }
    }
    return null;
  };

  const seen = new Set();
  const queue = [entry];
  const re = /\bfrom\s+["']([^"']+)["']|\brequire\(\s*["']([^"']+)["']\s*\)/g;
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file) || /\.ios\.(ts|tsx)$/.test(file)) continue;
    seen.add(file);
    let src;
    try {
      src = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const m of src.matchAll(re)) {
      const next = resolve(file, m[1] ?? m[2]);
      if (next && !seen.has(next)) queue.push(next);
    }
  }
  return [...seen];
}

/** Bare package name from a module specifier ('expo-router/x' -> 'expo-router'). */
function packageName(spec) {
  if (spec.startsWith(".") || spec.startsWith("/")) return null;
  const parts = spec.split("/");
  return spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

function importedPackages(files) {
  const found = new Map(); // pkg -> first file that imports it
  const re = /\bfrom\s+["']([^"']+)["']|\brequire\(\s*["']([^"']+)["']\s*\)/g;
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(re)) {
      const pkg = packageName(m[1] ?? m[2]);
      if (pkg && !found.has(pkg)) found.set(pkg, file);
    }
  }
  return found;
}

test("apps/android declares every dependency the shared code imports", () => {
  // The guard. A package that apps/mobile depends on AND non-iOS shared code
  // imports MUST be declared by apps/android, or its native module never gets
  // linked into the Android binary.
  const reachable = androidReachableFiles(join(repoRoot, "apps/mobile/App.tsx"));
  const imported = importedPackages(reachable);
  const androidDeps = new Set(Object.keys(androidPkg.dependencies ?? {}));
  const mobileDeps = new Set(Object.keys(mobilePkg.dependencies ?? {}));

  const missing = [];
  for (const [pkg, file] of imported) {
    if (!mobileDeps.has(pkg)) continue; // transitive or builtin — not ours to declare
    if (androidDeps.has(pkg)) continue;
    missing.push(`${pkg}  (imported by ${relative(repoRoot, file)})`);
  }

  assert.deepEqual(
    missing.sort(),
    [],
    "apps/android declares fewer dependencies than the code it ships imports. " +
      "This is a manifest/code mismatch to fix, not proof the build is broken — " +
      `autolinking may still resolve them from the hoisted tree:\n  ${missing.join("\n  ")}`,
  );
});

test("shared dependency versions match between mobile and android", () => {
  // Both apps load one hoisted node_modules tree, so mismatched ranges are a
  // lie about what actually ships. Expo's own `expo install --check` confirmed
  // mobile is the correct side for react-native-maps (1.20.1, not 1.27.2) and
  // react-native-web (^0.21.0) — newer was wrong here.
  const md = mobilePkg.dependencies ?? {};
  const ad = androidPkg.dependencies ?? {};
  const mismatched = Object.keys(ad)
    .filter((k) => k in md && md[k] !== ad[k])
    .map((k) => `${k}: mobile=${md[k]} android=${ad[k]}`);

  assert.deepEqual(mismatched, [], `version drift between the two apps:\n  ${mismatched.join("\n  ")}`);
});

test("android is still a wrapper around mobile, not a fork", () => {
  // Everything above assumes the two share code. If apps/android ever grows
  // its own screens, this parity model is wrong and these tests would give
  // false confidence.
  const appTsx = readFileSync(join(repoRoot, "apps/android/App.tsx"), "utf8");
  assert.match(appTsx, /from\s+["']\.\.\/mobile\/App["']/, "android must re-export mobile's App");

  let hasOwnScreens = true;
  try {
    hasOwnScreens = readdirSync(join(repoRoot, "apps/android/src")).length > 0;
  } catch {
    hasOwnScreens = false; // no src/ at all — correct
  }
  assert.equal(hasOwnScreens, false, "apps/android has grown its own src/ — parity assumptions no longer hold");
});
