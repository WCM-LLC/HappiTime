// test/checkin-code.test.mjs
//
// Anti-drift test suite for the deterministic check-in code generator.
// Imports the SAME JSON test-vector file as the Deno suite
// (supabase/functions/_shared/checkin-code.test.ts) so any divergence between
// the TS and Deno implementations fails here automatically.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { serviceDate, generateCheckinCode, CHARSET } from "../packages/shared-api/src/checkin/code.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VECTORS = JSON.parse(
  readFileSync(
    resolve(__dirname, "../supabase/functions/_shared/checkin-test-vectors.json"),
    "utf8",
  ),
);

// ── charset sanity ────────────────────────────────────────────────────────────
test("CHARSET matches vectors file", () => {
  assert.equal(CHARSET, VECTORS.charset, "CHARSET constant drifted from test-vector file");
});

test("CHARSET has exactly 31 characters", () => {
  assert.equal(CHARSET.length, 31);
});

test("CHARSET contains no ambiguous chars (0, O, 1, I, L)", () => {
  for (const ch of ["0", "O", "1", "I", "L"]) {
    assert.ok(!CHARSET.includes(ch), `CHARSET must not contain '${ch}'`);
  }
});

// ── serviceDate ───────────────────────────────────────────────────────────────
for (const v of VECTORS.cases) {
  test(`serviceDate: ${v.label}`, () => {
    assert.equal(
      serviceDate(new Date(v.instant_utc)),
      v.service_date,
      `instant ${v.instant_utc} should map to service_date ${v.service_date}`,
    );
  });
}

// ── generateCheckinCode ───────────────────────────────────────────────────────
for (const v of VECTORS.cases) {
  test(`generateCheckinCode: ${v.label}`, () => {
    if (v.code === "__PLACEHOLDER__") {
      assert.fail(
        `Test vector for "${v.label}" still has placeholder code — freeze real codes first`,
      );
    }
    assert.equal(
      generateCheckinCode(VECTORS.secret, v.service_date),
      v.code,
      `code for service_date ${v.service_date} should be ${v.code}`,
    );
  });
}

// ── determinism ───────────────────────────────────────────────────────────────
test("generateCheckinCode is deterministic (same inputs → same code)", () => {
  const secret = VECTORS.secret;
  const svcDate = VECTORS.cases[0].service_date;
  assert.equal(
    generateCheckinCode(secret, svcDate),
    generateCheckinCode(secret, svcDate),
  );
});

test("generateCheckinCode produces different codes for different dates", () => {
  const secret = VECTORS.secret;
  const codes = VECTORS.cases.map((v) => generateCheckinCode(secret, v.service_date));
  const unique = new Set(codes);
  // With 3 cases, at minimum 2 of the 3 dates differ (06-09, 06-08, 06-09)
  // so we get at least 2 distinct codes.
  assert.ok(unique.size >= 2, `Expected distinct codes for different dates, got: ${JSON.stringify(codes)}`);
});

test("generateCheckinCode output is exactly 4 characters from CHARSET", () => {
  const secret = VECTORS.secret;
  for (const v of VECTORS.cases) {
    const code = generateCheckinCode(secret, v.service_date);
    assert.equal(code.length, 4, `code '${code}' should be 4 chars`);
    for (const ch of code) {
      assert.ok(CHARSET.includes(ch), `code char '${ch}' not in CHARSET`);
    }
  }
});

test("counter > 0 changes the code (collision avoidance works)", () => {
  const secret = VECTORS.secret;
  const svcDate = VECTORS.cases[0].service_date;
  const c0 = generateCheckinCode(secret, svcDate, 0);
  const c1 = generateCheckinCode(secret, svcDate, 1);
  assert.notEqual(c0, c1, "counter=0 and counter=1 should produce different codes");
});
