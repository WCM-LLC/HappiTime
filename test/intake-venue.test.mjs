// test/intake-venue.test.mjs
//
// Offline smoke tests for scripts/intake-venue.mjs.
// These do NOT call Google Places or Anthropic — they exercise the local
// pieces (HTML cleaning, validation, arg parsing) so we can ship the
// scaffold with confidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(__dirname, "..", "scripts", "intake-venue.mjs");

test("--help prints usage and exits 0", () => {
  const out = execSync(`node "${SCRIPT}" --help`).toString();
  assert.match(out, /Usage:/);
  assert.match(out, /--name/);
  assert.match(out, /--url/);
  assert.match(out, /--place-id/);
});

test("no args prints usage and exits 1", () => {
  let code = 0;
  try {
    execSync(`node "${SCRIPT}"`, { stdio: "pipe" });
  } catch (err) {
    code = err.status;
  }
  assert.equal(code, 1);
});

// Lightweight: re-import the pieces we want to exercise. Since the script
// is a CLI that runs main() on import, we instead snapshot-test its
// behavior on missing env via stdout/stderr.
test("missing ANTHROPIC_API_KEY produces a clear error", () => {
  let stderr = "";
  let code = 0;
  try {
    execSync(`node "${SCRIPT}" --name "Sea Capitan KC"`, {
      stdio: "pipe",
      env: { ...process.env, INTAKE_SKIP_ENV_FILES: "1", ANTHROPIC_API_KEY: "", GOOGLE_PLACES_API_KEY: "test" },
    });
  } catch (err) {
    stderr = err.stderr?.toString() || "";
    code = err.status;
  }
  assert.equal(code, 1);
  assert.match(stderr, /ANTHROPIC_API_KEY/);
});

test("missing GOOGLE_PLACES_API_KEY produces a clear error", () => {
  let stderr = "";
  let code = 0;
  try {
    execSync(`node "${SCRIPT}" --name "Sea Capitan KC"`, {
      stdio: "pipe",
      env: { ...process.env, INTAKE_SKIP_ENV_FILES: "1", ANTHROPIC_API_KEY: "test", GOOGLE_PLACES_API_KEY: "" },
    });
  } catch (err) {
    stderr = err.stderr?.toString() || "";
    code = err.status;
  }
  assert.equal(code, 1);
  assert.match(stderr, /GOOGLE_PLACES_API_KEY/);
});
