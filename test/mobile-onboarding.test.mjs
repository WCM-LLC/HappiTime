import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

test("mobile app routes signed-in users through onboarding before authenticated tabs", () => {
  const source = read("apps/mobile/App.tsx");

  assert.match(source, /useOnboardingStatus\(session\)/);
  assert.match(source, /!onboarding\.hasCompletedOnboarding/);
  assert.match(source, /<OnboardingScreen/);
  assert.match(source, /<AuthenticatedApp session=\{session\}/);
});

test("onboarding persists completion remotely with local fallback state", () => {
  const source = read("apps/mobile/src/hooks/useOnboardingStatus.ts");

  assert.match(source, /happitime:onboarding:v/);
  assert.match(source, /\.from\("user_preferences"\)/);
  assert.match(source, /onboarding_completed_at/);
  assert.match(source, /onboarding_step:\s*"complete"/);
  assert.match(source, /writeLocalOnboarding\(userId, localState\)/);
});

test("permission prompts are gated by onboarding or profile preferences", () => {
  const locationHook = read("apps/mobile/src/hooks/useUserLocation.ts");
  const pushHook = read("apps/mobile/src/hooks/useConfigPushNotifications.ts");
  const mapScreen = read("apps/mobile/src/screens/MapScreen.tsx");
  const app = read("apps/mobile/App.tsx");

  // Location is opt-in: useUserLocation never auto-requests unless a screen opts in.
  assert.match(locationHook, /requestOnMount \?\? false/);
  // Screens gate the foreground location prompt on the saved location_enabled
  // preference (this gating moved out of App.tsx into the screens that use it).
  assert.match(mapScreen, /requestOnMount:\s*preferences\.location_enabled/);
  // Push registration is gated behind the notifications_push preference.
  assert.match(pushHook, /shouldRegisterForPushNotifications/);
  assert.match(pushHook, /notifications_push/);
  // Background visit tracking only runs after explicit visit-reminder consent.
  assert.match(app, /shouldTrack\(/);
});

test("Supabase migration adds backend onboarding state and preserves existing users", () => {
  const migration = read("supabase/migrations/20260515151616_mobile_onboarding_state.sql");

  assert.match(migration, /ADD COLUMN IF NOT EXISTS onboarding_completed_at/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS interests/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS location_enabled/);
  assert.match(migration, /UPDATE public\.user_preferences/);
  assert.match(migration, /FROM auth\.users AS users/);
});
