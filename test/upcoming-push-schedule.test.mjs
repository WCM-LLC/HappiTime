import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const mig = readFileSync(new URL("../supabase/migrations/20260611120000_schedule_upcoming_push.sql", import.meta.url), "utf8");
const hh = readFileSync(new URL("../supabase/functions/notify-upcoming-happy-hours/index.ts", import.meta.url), "utf8");
const ev = readFileSync(new URL("../supabase/functions/notify-upcoming-events/index.ts", import.meta.url), "utf8");
const cfg = readFileSync(new URL("../supabase/config.toml", import.meta.url), "utf8");

test("migration schedules both hourly crons via token-auth wrappers", () => {
  assert.match(mig, /notify_job_tokens/); assert.match(mig, /get_notify_job_token/);
  assert.match(mig, /invoke_notify_happy_hours/); assert.match(mig, /invoke_notify_events/);
  assert.match(mig, /'notify-happy-hours-hourly', '0 \* \* \* \*'/); assert.match(mig, /'notify-events-hourly', '0 \* \* \* \*'/);
  assert.match(mig, /x-notify-token/);
});

test("HH fn is TZ-corrected to America/Chicago + token-gated", () => {
  assert.match(hh, /America\/Chicago/); assert.match(hh, /x-notify-token/); assert.match(hh, /get_notify_job_token/);
});

test("events fn queries venue_events by starts_at, tier-gated, token-gated", () => {
  assert.match(ev, /venue_events/); assert.match(ev, /starts_at/); assert.match(ev, /user_followed_venues/);
  assert.match(ev, /notifications_venue_updates/); assert.match(ev, /x-notify-token/);
});

test("config.toml sets verify_jwt=false for both", () => {
  assert.match(cfg, /\[functions\.notify-upcoming-happy-hours\]\s*\nverify_jwt = false/);
  assert.match(cfg, /\[functions\.notify-upcoming-events\]\s*\nverify_jwt = false/);
});
