# Behavior-First Onboarding — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax. **Work in the `feat/onboarding-phase2` worktree** (`/Users/juanwilliams/Documents/GitHub/HappiTime-phase2`), off master with Phase 1 merged.

**Goal:** Make signup **earned** — a guest browsing freely is asked to sign in only when they try to **save** or **check in**; after the first signup, a one-time minimal step captures `@handle` + "Who brought you?" (referrer). No change to how existing users log in.

**Architecture:** Gate at the two action **chokepoints** (`useUserFollowedVenues.toggleFollow`, `useCheckin`) rather than every screen — when there's no session they fire a module-level trigger that the App root turns into an `EarnedSignupSheet`; the pending action resumes after signup. The sheet reuses the three existing `AuthScreen` providers (Apple / Google / email), extracted into one shared `SignInOptions` via a strictly behavior-preserving refactor. A `PostSignupCapture` (handle + referrer prefilled from `peekPendingReferral`) replaces the current handle gate.

**Tech Stack:** React Native / Expo, Supabase auth (existing handlers), AsyncStorage, `node --test`.

**Spec:** `docs/superpowers/specs/2026-06-11-behavior-first-onboarding-design.md` (§4 state machine, §5.4 sheet, §2.4 LOGIN INVARIANT). **Prereq:** Phase 1 merged (durable `pendingReferral`, `PreFeedOnboarding`).

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/mobile/src/screens/auth/SignInOptions.tsx` | shared Apple+Google+email sign-in block extracted from `AuthScreen` (one impl, behavior-preserving) |
| `apps/mobile/src/screens/AuthScreen.tsx` | render `<SignInOptions/>` (no behavior change) |
| `apps/mobile/src/lib/gatedAction.ts` | module-level trigger: `requestSignIn(action)` + handler registration; pending-action queue |
| `apps/mobile/src/components/EarnedSignupSheet.tsx` | bottom sheet (action-aware copy) hosting `SignInOptions` |
| `apps/mobile/src/components/PostSignupCapture.tsx` | one-time @handle + "Who brought you?" (prefill via `peekPendingReferral`) |
| `apps/mobile/src/hooks/useUserFollowedVenues.ts` | `toggleFollow` gates on session → `requestSignIn("save")` + queue |
| `apps/mobile/src/hooks/useCheckin.ts` | check-in gates on session → `requestSignIn("checkin")` + queue |
| `apps/mobile/App.tsx` | host `EarnedSignupSheet` + `PostSignupCapture`; resume pending action on new session |
| `test/onboarding-phase2.test.mjs` | source-assertions (login invariant, gating, capture) |

---

### Task 1: Extract `SignInOptions` (behavior-preserving — LOGIN INVARIANT)

**Files:** Create `apps/mobile/src/screens/auth/SignInOptions.tsx`; Modify `apps/mobile/src/screens/AuthScreen.tsx`; Test `test/onboarding-phase2.test.mjs`.

- [ ] **Step 1:** READ `AuthScreen.tsx` fully. Move the three provider UIs + their handlers VERBATIM into `SignInOptions` — the Apple `<AppleSignInButton .../>`, the Google `Pressable`→`handleGoogleSignIn` (`signInWithOAuth({provider:"google"})`), and the email input→`handleEmailContinue` (`signInWithOtp`). Props: `{ onAuthStarted?: () => void }` (optional, for status). Do NOT change any auth call, redirect, nonce, or error handling — copy exactly.
- [ ] **Step 2:** `AuthScreen` renders `<SignInOptions/>` in place of the inlined block; its outer chrome/heading stays.
- [ ] **Step 3: Login-invariant test** (`test/onboarding-phase2.test.mjs`):
```js
import test from "node:test"; import assert from "node:assert/strict"; import { readFileSync } from "node:fs";
const opts = readFileSync(new URL("../apps/mobile/src/screens/auth/SignInOptions.tsx", import.meta.url), "utf8");
test("SignInOptions keeps all three existing providers unchanged", () => {
  assert.match(opts, /AppleSignInButton/);
  assert.match(opts, /signInWithOAuth\(\{\s*provider:\s*"google"/);
  assert.match(opts, /signInWithOtp/);
});
```
- [ ] **Step 4:** `node --test test/onboarding-phase2.test.mjs` PASS; `cd apps/mobile && npx tsc --noEmit` clean. **Device-verify later:** all three login paths still work from `AuthScreen`.
- [ ] **Step 5: Commit** `feat(mobile): extract shared SignInOptions (behavior-preserving)`.

---

### Task 2: Gated-action trigger + EarnedSignupSheet at root

**Files:** Create `apps/mobile/src/lib/gatedAction.ts`, `apps/mobile/src/components/EarnedSignupSheet.tsx`; Modify `apps/mobile/App.tsx`.

- [ ] **Step 1:** `gatedAction.ts` (mirrors Phase 1's `backgroundConsentPrompt`):
```ts
export type GatedActionKind = "save" | "checkin";
let handler: ((kind: GatedActionKind) => void) | null = null;
export function setSignInRequestHandler(fn: ((kind: GatedActionKind) => void) | null): void { handler = fn; }
/** Called by a hook when a guest attempts a gated action. Returns true if a sign-in was requested. */
export function requestSignIn(kind: GatedActionKind): boolean { if (!handler) return false; handler(kind); return true; }
```
- [ ] **Step 2:** `EarnedSignupSheet.tsx` — a `Modal` bottom sheet; title/subtitle keyed by `kind` ("Save your spots" / "Start earning rounds"); renders `<SignInOptions/>`; a "Not now" dismiss. Props `{ kind: GatedActionKind | null; onDismiss: () => void }`; visible when `kind != null`.
- [ ] **Step 3:** In `App.tsx` `AppRoot`, add `const [signupKind, setSignupKind] = useState<GatedActionKind | null>(null);`, register the handler in an effect (`setSignInRequestHandler(setSignupKind); return () => setSignInRequestHandler(null);`), and render `<EarnedSignupSheet kind={signupKind} onDismiss={() => setSignupKind(null)} />` near the other root modals. When a new `session` arrives (the existing `onAuthStateChange`), clear `signupKind` (the sheet auto-closes on success).
- [ ] **Step 4:** `tsc` clean. **Commit** `feat(mobile): earned-signup sheet + gated-action trigger`.

---

### Task 3: Gate the SAVE chokepoint

**Files:** Modify `apps/mobile/src/hooks/useUserFollowedVenues.ts`; Create `apps/mobile/src/lib/pendingGatedAction.ts`.

- [ ] **Step 1:** `pendingGatedAction.ts` — a module-level queue so the action resumes post-signup:
```ts
let pending: (() => void) | null = null;
export function queueGatedAction(fn: () => void): void { pending = fn; }
export function runPendingGatedAction(): void { const f = pending; pending = null; f?.(); }
```
- [ ] **Step 2:** In `toggleFollow`, when there is **no signed-in user** (check the hook's existing `user`/session source) and the call is a NEW follow: `queueGatedAction(() => toggleFollow(venueId))` then `requestSignIn("save")` and return (don't write). When signed in, behave exactly as today. (Read the hook to use its real user/session accessor; don't assume.)
- [ ] **Step 3:** `tsc` clean; add a source-assertion to `test/onboarding-phase2.test.mjs` that `useUserFollowedVenues` calls `requestSignIn("save")` + `queueGatedAction`. **Commit** `feat(mobile): gate save behind earned signup`.

---

### Task 4: Gate the CHECK-IN chokepoint

**Files:** Modify `apps/mobile/src/hooks/useCheckin.ts`.

- [ ] **Step 1:** READ `useCheckin.ts`. At the entry of the check-in submit (before it calls `verify-checkin`), if there's no session: `queueGatedAction(() => <retry the same check-in>)` + `requestSignIn("checkin")` + return. Signed-in behavior unchanged. (Check-in already requires a venue/code/geo context — make sure the queued retry captures those args.)
- [ ] **Step 2:** `tsc` clean; source-assertion that `useCheckin` calls `requestSignIn("checkin")`. **Commit** `feat(mobile): gate check-in behind earned signup`.

---

### Task 5: PostSignupCapture (handle + referrer) + resume

**Files:** Create `apps/mobile/src/components/PostSignupCapture.tsx`; Modify `apps/mobile/App.tsx`.

- [ ] **Step 1:** `PostSignupCapture.tsx` — shown once when a new session has **no handle yet** (reuse the existing `handleGate === "needed"` detection in `App.tsx`). Fields: `@handle` (reuse the handle input + validation/availability check from `OnboardingScreen`/`HandleGateScreen`) + "Who brought you?" **prefilled** from `await peekPendingReferral()`. On submit: set the handle (existing path), and if the referrer field is non-empty call `record_referral(handle, "code")` (idempotent; the durable stash also auto-applies via `useReferralCapture`, so this is a confirm/backstop). Skippable.
- [ ] **Step 2:** In `App.tsx`, replace the current `handleGate === "needed"` → `HandleGateScreen` branch with `<PostSignupCapture/>` (keep the gate detection logic). After it completes/skips → continue into the app. On a NEW session arriving, call `runPendingGatedAction()` so the queued save/check-in completes.
- [ ] **Step 3:** `tsc` clean; source-assertion that `PostSignupCapture` uses `peekPendingReferral` + that App runs `runPendingGatedAction` on new session. **Commit** `feat(mobile): post-signup handle+referrer capture + resume pending action`.

---

### Task 6: Integration verify + cleanup

- [ ] **Step 1:** `node --test test/onboarding-phase2.test.mjs` + the full mobile suite green; `cd apps/mobile && npx tsc --noEmit` clean.
- [ ] **Step 2:** Confirm the **LOGIN INVARIANT**: `AuthScreen` still renders the three providers (now via `SignInOptions`); existing users sign in unchanged. Confirm guests can browse and only hit the sheet on save/check-in.
- [ ] **Step 3:** **Device-verify (rides next build):** guest → save → sheet → Apple/Google/email → PostSignupCapture (handle prefilled referrer) → the save completes; same for check-in; existing login still works; a QR-as-guest from Phase 1 still attributes on this signup.
- [ ] **Step 4: Commit** any cleanup.

---

## Phase 2 Acceptance
- [ ] A guest who taps Save or Check-in sees the EarnedSignupSheet (Apple/Google/email); on success the original action completes.
- [ ] First signup shows the one-time handle + "Who brought you?" step (referrer prefilled from the durable stash); attribution lands via `record_referral`.
- [ ] **Login invariant:** `AuthScreen`'s three providers are unchanged (extracted, not altered); existing users log in exactly as before.
- [ ] `apps/mobile` tsc clean; Phase 2 tests green; no new native deps.

## Self-Review
- **Spec coverage:** §4 state machine (gated → signup → resume) → T2-T5; §5.4 sheet reusing existing providers → T1+T2; minimal post-signup capture (§2.2) → T5; durable attribution reuse (§6, from Phase 1) → T5 prefill + existing `useReferralCapture`.
- **Centralized gating** (hooks, not screens) keeps the diff small + consistent; module-level triggers mirror the proven Phase 1 pattern.
- **Login invariant** is Task 1's explicit, tested guardrail (extract-not-alter).
- **Deferred:** native one-tap Google (spec §12); contextual notif prime + vibes/pref persistence (Phase 3).
- All JS → OTA-able; no new native deps.
