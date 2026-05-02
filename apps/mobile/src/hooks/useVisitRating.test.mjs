import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

test("fallback insert payload uses enteredAt timestamp field", () => {
  const source = readFileSync(join(__dirname, "useVisitRating.ts"), "utf8");

  assert.match(source, /entered_at:\s*pendingVisit\.enteredAt/);
  assert.doesNotMatch(source, /entered_at:\s*pendingVisit\.visitedAt/);
});
