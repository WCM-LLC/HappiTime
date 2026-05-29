# AI Venue Intake Agent

`scripts/intake-venue.mjs` — turn a venue name or URL into a draft HappiTime
listing, with happy-hour windows + offers, in ~30 seconds and for roughly
$0.02–0.05 in API costs per venue.

This is the **Layer 1** of the AI roadmap discussed in the BD strategy memo
(autonomous venue onboarding). It is intentionally read-only: it writes a JSON
file you review with the venue owner before any DB write happens.

---

## What it does

1. **Discover** — resolves a venue name to a Google Place ID (or you can pass
   `--url` / `--place-id` directly).
2. **Places** — pulls authoritative address, lat/lng, phone, website, hours,
   rating, price_level from the Google Places Details API.
3. **Scrape** — fetches the venue website plus any linked happy-hour/specials
   subpage, strips HTML to plain text.
4. **Extract** — sends the Places data + scraped text to Claude with a strict
   JSON schema prompt. Returns `venue`, `happy_hour_windows`,
   `happy_hour_offers`, social URLs, neighborhood, tags, price tier.
5. **Validate** — checks enums, time format, `dow` 0-6 (0=Sunday), and flags
   per-field confidence and human-review items.
6. **Emit** — writes `scripts/intake-output/<slug>.json` (or stdout).

## What it does NOT do (yet)

- It does **not** write to Supabase. By design — first prove the extraction
  quality, then add a writer that respects RLS + org assignment.
- It does **not** ingest photos. Use the existing `scripts/fetch-venue-photos.mjs`
  for that, post-confirmation.
- It does **not** poll for changes. Layer 2 (always-on deal sync) is a separate
  cron — this script is one-shot.

## Setup

Required env (loaded from `.env`, `apps/web/.env.local`, or `apps/mobile/.env`):

```
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_PLACES_API_KEY=...           # already used by enrich-venues.mjs
```

Optional:

```
INTAKE_MODEL=claude-sonnet-4-6      # default
INTAKE_HTTP_TIMEOUT_MS=15000        # per HTTP request
INTAKE_MAX_TEXT_CHARS=30000         # cap on scraped text sent to Claude
```

Get an Anthropic API key at https://console.anthropic.com and put it in `.env`
at the repo root. No new npm install is needed — the script uses native `fetch`.

## Usage

```bash
# By name (the most common path):
node scripts/intake-venue.mjs --name "Tacos Valentina Kansas City"

# By website URL:
node scripts/intake-venue.mjs --url https://seacapitankc.com

# By Place ID (if you already have one):
node scripts/intake-venue.mjs --place-id ChIJ...

# Pipe to stdout instead of writing a file:
node scripts/intake-venue.mjs --name "Earl's Premier" --stdout

# Write to a specific path:
node scripts/intake-venue.mjs --name "Bacaro Primo" --out /tmp/bacaro.json
```

Optional npm script (add to `package.json` if you want it):

```json
"data:intake-venue": "node scripts/intake-venue.mjs"
```

## Output shape

```json
{
  "source": {
    "place_id": "ChIJ...",
    "seed_url": "https://venue.example.com",
    "scraped_pages": ["https://venue.example.com", "https://venue.example.com/specials"]
  },
  "draft": {
    "venue": {
      "name": "Tacos Valentina",
      "address": "1708 Cherry St",
      "city": "Kansas City",
      "state": "Missouri",
      "zip": "64108",
      "neighborhood": "Crossroads",
      "phone": "+1 816-555-0123",
      "website": "https://tacosvalentinakc.com",
      "instagram_url": "https://instagram.com/tacosvalentinakc",
      "lat": 39.0888,
      "lng": -94.5836,
      "price_tier": 2,
      "tags": ["tacos","mexican","crossroads","brewery-adjacent"],
      "google_place_id": "ChIJ...",
      "google_rating": 4.7,
      "google_review_count": 312
    },
    "happy_hour_windows": [
      { "dow": [1,2,3,4,5], "start_time": "15:00", "end_time": "18:00", "label": "Weekday HH" }
    ],
    "happy_hour_offers": [
      { "category": "drink", "title": "$2 off draft beer", "description": "$2 off all draft beers during weekday happy hour", "window_index": 0 },
      { "category": "food",  "title": "$4 street tacos",   "description": "Choice of street taco for $4", "window_index": 0 }
    ],
    "_confidence": { "venue.neighborhood": "high", "happy_hour_windows.0": "medium" },
    "_review_flags": ["happy_hour_windows.0.dow","happy_hour_offers"]
  },
  "validation": { "errors": [], "ok": true },
  "usage": { "input_tokens": 4823, "output_tokens": 612 },
  "generated_at": "2026-05-28T10:30:00.000Z",
  "model": "claude-sonnet-4-6"
}
```

`_confidence` and `_review_flags` are the human-in-the-loop hooks: anything
flagged should be confirmed with the venue owner before publishing.

## Cost per run

Rough envelope (Sonnet 4.6, May 2026 pricing):

- Google Places Text Search + Details: ~$0.022
- Anthropic API: ~5k input tokens × $3/M + 600 output tokens × $15/M ≈ $0.024
- **Total: ~$0.05 per venue.**

A full KC saturation pass (say 800 venues) costs ~$40 in API. Compare to your
current cost in time per venue.

## Smoke test plan (next step)

Run on these three venues from BD memory:

```bash
node scripts/intake-venue.mjs --name "Tacos Valentina Kansas City"
node scripts/intake-venue.mjs --name "Sea Capitan Kansas City"
node scripts/intake-venue.mjs --name "Buenos Aires Restaurant Shawnee"
```

Then eyeball the three JSONs for:

- Address + lat/lng correct? (sanity check on Places)
- Happy hour windows present if the venue advertises them?
- Social URLs populated when the homepage links to them?
- Tags reasonable?
- `_review_flags` covering anything you'd want a human to confirm?

Track per-venue results in a spreadsheet:
`venue | needed manual edits? | missing fields | over-extracted? | time to fix`.

Decision rule: if 7 of 10 random venues need ≤ 3 manual edits, ship Layer 2.

## Roadmap

- **Layer 1 (this script)** — one-shot intake, JSON only. Done.
- **Layer 1.5 — Field Capture (DONE).** Phone-friendly route in `apps/web` for
  capturing happy-hour data that doesn't exist online. See "Field Capture"
  below.
- **Layer 2** — daily cron over published venues; re-scrape website + IG, diff,
  raise proposed deal updates in the portal review queue (not auto-publish).
- **Layer 3** — venue copilot in the console (natural language analytics +
  promo suggestions).
- **Layer 4** — consumer concierge in mobile ("near me, under $8, next 90 min").

---

# Field Capture (Layer 1.5)

The CLI agent above handles everything that's already on the web. Field
Capture handles what isn't — chalkboards, table tents, printed menus, the
data that requires a physical visit. Photo in → structured windows + offers
out, in roughly 30 seconds standing inside the venue.

## Routes

- `/intake/capture` — admin-only mobile UI. Pick venue → snap photo →
  Claude vision extracts windows + offers → review/edit → commit.
- `/api/intake/extract` (POST, multipart) — admin-only. Accepts an image
  file + optional venue name, returns the proposed JSON draft.
- `/api/intake/commit` (POST, JSON) — admin-only. Writes windows + offers
  to Supabase. If `send_owner_confirmation=true`, writes as `draft` and
  emails the owner a signed claim link. Otherwise writes as `published`.
- `/claim/[token]` — public route. Owner clicks the link from the email,
  reviews the draft, taps "Publish" once.
- `/api/intake/claim` (POST, JSON `{token}`) — flips draft → published when
  the owner confirms. No user auth; the signed token IS the authorization.

## Auth & data flow

- Field UI + extract + commit: gated on `isAdminEmail(user.email)` — same
  helper used by stripe/checkout. Staff/founder only for now.
- DB writes use the service-role client (`createServiceClient`) since the
  hardened RLS on `happy_hour_*` blocks anon inserts.
- Owner confirmation uses a stateless HMAC token (no new table): the token
  carries `venue_id` + `window_ids[]` + `offer_ids[]` + 14-day `exp` and is
  signed with `INTAKE_CONFIRM_SECRET`. See `apps/web/src/utils/intake-token.ts`.

## Required env

```
# Vision provider — choose one. Default is gemini.
INTAKE_VISION_PROVIDER=gemini          # 'gemini' (default, free tier) | 'anthropic'

# If provider=gemini  (FREE TIER: 15 req/min, 1,500 req/day, image input included)
GOOGLE_AI_API_KEY=<...>                # get one at https://aistudio.google.com/apikey

# If provider=anthropic
ANTHROPIC_API_KEY=sk-ant-...           # console.anthropic.com — separate billing from Claude.ai

# Optional: override the model. Defaults: gemini-2.5-flash / claude-sonnet-4-6
INTAKE_MODEL=

# Owner-confirmation flow (optional; toggle is disabled in the UI if unset)
INTAKE_CONFIRM_SECRET=<32+ chars>
RESEND_API_KEY=<...>                   # if missing, commit returns claim_url to copy manually

# Already required by the rest of the app
SUPABASE_SERVICE_ROLE_KEY=<...>
```

### Why Gemini by default

- **Free tier covers field testing.** 1,500 captures/day is more venues than
  you can physically visit in a week, at $0 cost.
- **HEIC support.** Gemini's vision API accepts `image/heic` and `image/heif`
  natively, so iPhones with "High Efficiency" camera mode just work.
- **Strict JSON.** `responseMimeType: application/json` returns clean JSON
  every time — no markdown-fence stripping bugs.
- **Swap is one env var.** Set `INTAKE_VISION_PROVIDER=anthropic` once you
  have Anthropic API billing set up and the rest of the code is unchanged.

Get a Gemini API key at https://aistudio.google.com/apikey — sign in with
Google, click "Create API key," paste into `apps/web/.env.local`.

If `INTAKE_CONFIRM_SECRET` is missing, the confirmation switch in the UI is
disabled (greyed out with a helper note) and the auto-publish path still
works. If `RESEND_API_KEY` is missing the commit returns a `claim_url` in
the response so you can copy it to the owner manually.

## Owner confirmation as a marketing tool

The confirmation toggle is intentionally an opt-in switch, not the default.
Reasons to use it:

- **Cold-open venues** (you captured a deal without talking to the owner).
  The email is your first touch — "Hi from HappiTime 👋, here's what we
  drafted." The "Publish" button is a frictionless self-claim.
- **Onboarding handoff.** After your in-person pitch, capture the deal,
  send the link, let the owner take 30 seconds to verify on their phone.
- **Re-engagement.** Same flow for a venue you previously listed but
  haven't talked to in 3+ months — re-photograph, re-draft, re-send.

Reasons NOT to use it:

- The owner just verbally walked you through it. Auto-publish saves the round
  trip; you've already got the trust.
- The owner is sitting next to you while you capture. Same reason.

## The full happy-hour pipeline

For a brand new venue, the end-to-end flow is now:

1. `npm run data:intake-venue -- --name "Roger's New Bar KC"`
   → creates a draft JSON of the venue shell (address, hours, social, tags).
2. Upsert that into `venues` (manually for now; a writer is the next layer
   to build).
3. Walk in. Pull up `/intake/capture` on your phone. Pick the venue.
4. Snap the happy-hour board.
5. Review the extraction (the dow pills + time pickers make corrections
   one-thumb fast).
6. Either auto-publish or flip the toggle to draft + email the owner.

Time from "Roger says yes" to "live listing": **under 5 minutes**, with the
agent doing 90% of the typing.

## Files

```
apps/web/src/utils/intake-token.ts                    HMAC sign/verify
apps/web/src/utils/email.ts                           sendVenueOwnerConfirmation
apps/web/src/app/api/intake/extract/route.ts          POST multipart → vision
apps/web/src/app/api/intake/commit/route.ts           POST JSON → insert
apps/web/src/app/api/intake/claim/route.ts            POST {token} → publish
apps/web/src/app/intake/capture/page.tsx              server gate (admin)
apps/web/src/app/intake/capture/CaptureClient.tsx     mobile UI
apps/web/src/app/claim/[token]/page.tsx               public preview
apps/web/src/app/claim/[token]/ClaimForm.tsx          publish button
```

## Smoke test plan (manual, in-app)

1. `npm run dev:web`. Sign in as an admin email.
2. Visit `/intake/capture` on your phone (or browser dev tools mobile view).
3. Search "Sea Cap" → pick Sea Capitán.
4. Use a test image of any happy-hour sign (Google Images has plenty).
5. Tap "Extract". Confirm windows + offers populate sensibly.
6. Edit one window's dow pills, change one offer's category.
7. Leave the confirmation toggle OFF → tap "Auto-publish". Check Supabase:
   should see new rows in `happy_hour_windows` and `happy_hour_offers` with
   `status='published'` for the venue.
8. Reset, capture again, this time enable "Send owner a confirmation link"
   and email it to yourself. Verify the email arrives, click the link, hit
   "Publish". Check Supabase: rows flipped from `draft` to `published`.

## Known limitations (Layer 1.5)

- No retry/backoff on Anthropic. A failed extract returns 502; user re-taps.
- No image storage. The photo is sent to Claude and thrown away — fine for
  the field workflow, but we lose the audit trail. Layer 2 might add
  Cloudinary upload + reference back to source photo on the listing.
- No batch capture. One venue, one photo per session. Multi-photo capture
  (e.g. "front board" + "back menu") is a small follow-up if needed.
- The dow pills assume Sunday-first (US convention) — matches the existing
  formatters.

## Known limitations

- HTML-only scrape: JS-rendered sites (Squarespace, Wix sometimes) will be
  thin. If results look weak, swap `scrapeText` for Nimble's headless fetch.
- Instagram public pages are increasingly login-gated; we currently rely on
  whatever IG links the website exposes. Layer 2 will add Nimble for IG.
- The `dow` convention is 0=Sunday (matches `apps/mobile/src/utils/formatters.ts`).
  If a future module shifts to ISO (1=Monday), update both the prompt and
  the validator.
- No retry/backoff on Places or Anthropic calls. Acceptable at this scale;
  revisit if running >100 venues per batch.
