// test/mobile-android-dependency-parity.test.mjs
//
// apps/android is a build wrapper, not a codebase: its App.tsx is literally
// `export { default } from "../mobile/App"`. Same JS, same 0.1.0 version — but
// it declares its OWN dependency list, and that list froze on 2026-05-31
// (PR #37) while apps/mobile kept adding packages.
//
// Why nothing caught it: the two halves resolve from different places.
//
//   JS      — Metro resolves node_modules by walking up from the IMPORTING
//             file. ScanMenuScreen.tsx lives in apps/mobile/src, so it finds
//             apps/mobile/node_modules and the import succeeds.
//   Native  — Expo autolinking reads the BUILD APP's package.json, i.e.
//             apps/android's. A package absent there is never linked into the
//             binary.
//
// So the Android build succeeds, the bundle contains the code, and the feature
// fails only when it reaches for the native module at runtime.
//
// The damage on Android as of 2026-08-13:
//   expo-image-picker      → Happy Hour scan (ScanMenuScreen), avatar upload
//   expo-image-manipulator → same
//   base64-arraybuffer     → avatar upload (added to mobile in PR #69)
//
// Platform-specific files are excluded. AppleSignInButton.ios.tsx imports
// expo-apple-authentication and (via appleNonce) expo-crypto, but Metro only
// resolves `.ios.tsx` on iOS and AppleSignInButton.tsx is a null-rendering
// fallback — so Android correctly does not need those.

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
    "apps/android is missing dependencies its shared code imports — their native " +
      `modules will not be linked into the Android build:\n  ${missing.join("\n  ")}`,
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
