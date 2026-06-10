// supabase/functions/_shared/checkin-code.test.ts
//
// Anti-drift test suite for the Deno check-in code generator.
// Imports the SAME JSON test-vector file as the Node suite
// (test/checkin-code.test.mjs), ensuring both implementations produce
// IDENTICAL codes for every vector.  A mismatch here means the TS and Deno
// impls have drifted — fix both to agree.
//
// Run: deno test supabase/functions/_shared/checkin-code.test.ts --allow-read

import { assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { serviceDate, generateCheckinCode, CHARSET } from "./checkin-code.ts";

// Load vectors from the shared JSON file (path relative to repo root, resolved
// via Deno's import.meta.url so the test works regardless of cwd).
const __dir = new URL(".", import.meta.url).pathname;
const vectorsPath = `${__dir}checkin-test-vectors.json`;

// deno's readTextFile is async; use Deno.readTextFileSync for simplicity.
interface Vector {
  label: string;
  instant_utc: string;
  service_date: string;
  code: string;
}
interface Vectors {
  charset: string;
  secret: string;
  cases: Vector[];
}

const VECTORS: Vectors = JSON.parse(Deno.readTextFileSync(vectorsPath));

// ── charset sanity ────────────────────────────────────────────────────────────
Deno.test("CHARSET matches vectors file", () => {
  assertEquals(CHARSET, VECTORS.charset, "CHARSET constant drifted from test-vector file");
});

Deno.test("CHARSET has exactly 31 characters", () => {
  assertEquals(CHARSET.length, 31);
});

Deno.test("CHARSET contains no ambiguous chars (0, O, 1, I, L)", () => {
  for (const ch of ["0", "O", "1", "I", "L"]) {
    assertEquals(CHARSET.includes(ch), false, `CHARSET must not contain '${ch}'`);
  }
});

// ── serviceDate ───────────────────────────────────────────────────────────────
for (const v of VECTORS.cases) {
  Deno.test(`serviceDate: ${v.label}`, () => {
    assertEquals(
      serviceDate(new Date(v.instant_utc)),
      v.service_date,
      `instant ${v.instant_utc} should map to service_date ${v.service_date}`,
    );
  });
}

// ── generateCheckinCode (anti-drift: must match frozen vectors) ───────────────
for (const v of VECTORS.cases) {
  Deno.test(`generateCheckinCode: ${v.label}`, () => {
    if (v.code === "__PLACEHOLDER__") {
      throw new Error(
        `Test vector for "${v.label}" still has placeholder code — freeze real codes first`,
      );
    }
    assertEquals(
      generateCheckinCode(VECTORS.secret, v.service_date),
      v.code,
      `Deno code drifted from frozen vector for service_date ${v.service_date}`,
    );
  });
}

// ── determinism ───────────────────────────────────────────────────────────────
Deno.test("generateCheckinCode is deterministic (same inputs → same code)", () => {
  const secret = VECTORS.secret;
  const svcDate = VECTORS.cases[0].service_date;
  assertEquals(
    generateCheckinCode(secret, svcDate),
    generateCheckinCode(secret, svcDate),
  );
});

Deno.test("generateCheckinCode output is exactly 4 characters from CHARSET", () => {
  for (const v of VECTORS.cases) {
    const code = generateCheckinCode(VECTORS.secret, v.service_date);
    assertEquals(code.length, 4, `code '${code}' should be 4 chars`);
    for (const ch of code) {
      assertEquals(CHARSET.includes(ch), true, `code char '${ch}' not in CHARSET`);
    }
  }
});

Deno.test("counter > 0 changes the code (collision avoidance works)", () => {
  const secret = VECTORS.secret;
  const svcDate = VECTORS.cases[0].service_date;
  const c0 = generateCheckinCode(secret, svcDate, 0);
  const c1 = generateCheckinCode(secret, svcDate, 1);
  assertNotEquals(c0, c1, "counter=0 and counter=1 should produce different codes");
});
