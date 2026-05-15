# HappiTime — Documentation Index

Master navigation hub for all project docs. Start here.

---

## Getting started

| File | What it covers |
|------|----------------|
| [README.md](../README.md) | Monorepo overview, workspace map, first-run commands |
| [ENV.md](../ENV.md) | All environment variables for web, mobile, and Supabase |
| [DESIGN_SETUP.md](../DESIGN_SETUP.md) | Tailwind design tokens, font/icon install commands |

---

## Database

| File | What it covers |
|------|----------------|
| [DB_SCHEMA.md](../DB_SCHEMA.md) | Table definitions, column purposes, key relationships |
| [MIGRATIONS.md](../MIGRATIONS.md) | How to write, apply, and roll back Supabase migrations |
| [RLS.md](../RLS.md) | Row Level Security policies and how to audit them |
| [docs/supabase-migration-troubleshooting.md](supabase-migration-troubleshooting.md) | Common migration errors and fixes |

---

## Auth & security

| File | What it covers |
|------|----------------|
| [AUTH_ADMIN_CHECKLIST.md](../AUTH_ADMIN_CHECKLIST.md) | Regression checklist for any auth or middleware change |
| [SECURITY_SECRETS.md](../SECURITY_SECRETS.md) | Secret rotation, `.env` handling, CI/EAS injection |

---

## Operations & deployment

| File | What it covers |
|------|----------------|
| [DEPLOYMENT.md](../DEPLOYMENT.md) | Vercel + Supabase deploy steps, env var checklist |
| [PRODUCTION_REVIEW.md](../PRODUCTION_REVIEW.md) | Production readiness audit (2026-05-02) |
| [supabase/functions/import-places/README.md](../supabase/functions/import-places/README.md) | import-places edge function operator guide |

---

## Apps

| File | What it covers |
|------|----------------|
| [apps/web/README.md](../apps/web/README.md) | Next.js web client — local dev, build, deploy |
| [apps/mobile/README.md](../apps/mobile/README.md) | Expo/React Native mobile app — local dev, EAS build |
| [apps/android/README.md](../apps/android/README.md) | Android-specific Expo config, Play Console notes |
| [apps/mobile/store-metadata.md](../apps/mobile/store-metadata.md) | App Store and Google Play listing copy |

---

## Data enrichment scripts

Scripts live in `scripts/` and are wired as `npm run data:*` commands.

| Command | Script | What it does |
|---------|--------|--------------|
| `npm run data:enrich-venues` | `scripts/enrich-venues.mjs` | Fills lat/lng, rating, website, phone from Google Places (unverified venues only) |
| `npm run data:fetch-photos` | `scripts/fetch-venue-photos.mjs` | Multi-source photo pull (Places → website scrape → Unsplash) |
| `npm run data:fetch-covers` | `scripts/fetch-venue-covers.mjs` | Fetches cover images for venues that have a Places ID |
| `npm run data:assign-placeholders` | `scripts/assign-placeholder-covers.mjs` | Assigns generic placeholder covers to venues with no media |

---

## Engineering backlogs & history

| File | What it covers |
|------|----------------|
| [TODO.md](../TODO.md) | Immediate action items (short-lived — items ship or move to BACKLOG) |
| [BACKLOG.md](../BACKLOG.md) | Intentional deferrals, partially-wired features, known cleanup debt |
| [CODE_HISTORY_NOTES.md](../CODE_HISTORY_NOTES.md) | Implementation rationale stripped from source during 2026-04-25 cleanup |
| [REPO_RECOVERY_PLAN.md](../REPO_RECOVERY_PLAN.md) | Recovery audit from 2026-04-28 — all items resolved |
| [docs/post-mvp-todos.md](post-mvp-todos.md) | Post-MVP improvements identified during stabilization |
| [docs/mobile-typecheck-errors.md](mobile-typecheck-errors.md) | Pre-existing mobile typecheck errors as of 2026-04-27 |

---

## Testing

| File | What it covers |
|------|----------------|
| [TESTING.md](../TESTING.md) | Unit test setup, smoke tests, how to run the full suite |
