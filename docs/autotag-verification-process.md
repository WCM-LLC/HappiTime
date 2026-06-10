# Venue Autotagging — Verification Process & Automation

**Status:** Live (June 2026) · **Owner:** Juan · **Function:** `autotag-venues` edge function · **Audit:** `tag_suggestions` + `autotag_runs`

## Why

`venue_tags` is the source of truth for venue tags (the `venues.tags` text array is legacy ingest output). Coverage before automation: 164/174 published venues tagged, averaging only 3.0 tags/venue, with 10 venues at zero. Tags drive discovery filters, so thin tags = invisible venues. This system tags venues automatically, with verification gates so wrong tags don't ship to the app.

## Architecture

```
signals ──► score ──► gates ──► tier
                                 ├─ auto-apply  → venue_tags (+ audit row in tag_suggestions, applied_at set)
                                 ├─ review      → tag_suggestions (applied_at NULL — human approves/rejects)
                                 └─ discard     → not persisted
```

One edge function, `autotag-venues`, runs the whole pipeline. Modes:

| Mode | Writes |
|---|---|
| `dry-run` | Nothing. Returns full decision JSON for inspection. |
| `suggest` | `tag_suggestions` only — nothing touches `venue_tags`. |
| `apply` | Suggestions + auto-applies the high-confidence tier to `venue_tags`. |

## Signal extractors

Each extractor emits `(venue_id, tag_slug, source, confidence, evidence)`. Evidence is a human-readable string stored with every suggestion so any tag can be traced to why it exists.

| Source | What it reads | Base confidence | Notes |
|---|---|---|---|
| `google_attributes` | `staging_venues.payload->attributes` (Google additionalInfo), joined on `places_id` | 0.70–0.92 per mapping | Factual crowd/owner-reported attributes: "Outdoor seating", "Wheelchair accessible entrance", "Karaoke", "Vegan options", "Identifies as Black-owned"… |
| `google_category` | `payload->categoryName/categories` | 0.85 | "Mexican restaurant" → `mexican`, "Sushi restaurant" → `sushi` |
| `cuisine_field` | `venues.cuisine_type` | 0.85 | Direct field set by us/owner |
| `legacy_array` | `venues.tags` slugs, normalized | 0.75 | `cocktail_bar`→`cocktail-bar`, `hamburger`→`burger`, `family`→`family-friendly`, etc. |
| `name_keyword` | `venues.name` | 0.80 | Names are deliberate: "Taqueria…"→`mexican`, "… Wine Bar"→`wine-bar` |
| `menu_text` | `menu_items.name/description` (+ section names) | 0.60 base, +0.05/extra distinct item, cap 0.80 | Requires ≥2 distinct matching items for drink/cuisine tags (one margarita on a menu ≠ margarita spot) |
| `website_scan` | Venue homepage fetch (6s timeout, HTML stripped) | 0.65 | Specific phrases only: "dog friendly", "trivia night", "live music", "rooftop"… |

**Score aggregation** per (venue, tag): `combined = 1 − Π(1 − cᵢ)` across distinct sources, capped at 0.99. Independent agreement raises confidence; one weak signal stays weak.

## Verification gates (in order)

1. **Taxonomy gate** — tag must exist in `approved_tags` and be `is_active`. Inactive tags (`asian`, `casual`) can never be suggested.
2. **Identity gate** — ownership/identity tags (`black-owned`, `women-owned`, `latinx-owned`, `lgbtq-owned`, `veteran-owned`, `lgbtqia-friendly`) are **never auto-applied**, regardless of confidence — even when Google reports "Identifies as Black-owned". They always go to review. `wheelchair-accessible` from Google accessibility attributes is treated as factual and may auto-apply.
3. **Tombstone gate** — a (venue, tag) pair with `rejected_at` set in `tag_suggestions` is never re-suggested or re-applied. Human rejection is permanent until the row is deleted.
4. **Existing-tag gate** — tags already in `venue_tags` are skipped (no duplicate suggestions, no churn).
5. **Locked-venue gate** — if `venues.is_verified` and `'tags' ∈ data_locked_fields`, everything routes to review; the function never fights the lock trigger.
6. **Confidence tiers** —
   - **Auto-apply:** combined ≥ 0.85 **and** (≥2 independent sources **or** a single source with base ≥ 0.90)
   - **Review:** combined ≥ 0.50
   - **Discard:** below 0.50
7. **Cardinality gate** — auto-apply caps per venue per run: 3 cuisine, 4 vibe, 5 feature, 4 drink_type (highest confidence wins; overflow demoted to review). Prevents tag spam on text-heavy venues.
8. **Idempotence** — `venue_tags` insert is `ON CONFLICT DO NOTHING`; `tag_suggestions` upserts on `(venue_id, tag_id, source)`. Re-running is always safe.
9. **Audit** — every auto-applied tag has a `tag_suggestions` row with `source`, `confidence`, `evidence`, `applied_at`. Every run writes an `autotag_runs` row with mode, counts, and error list.

## What the system will never do

- Remove a tag (deletion is human-only, via portal or SQL).
- Re-add a tag a human rejected (tombstones).
- Auto-apply identity/ownership tags.
- Touch unpublished/staging venues.
- Override the verified-venue field lock.

## Venue selection & scheduling

A venue needs processing when it has no row in `autotag_venue_state` or `venues.updated_at > last_autotagged_at`. Each run records state per venue, so the nightly job converges to a no-op until venues change. Inserting into `venue_tags` does **not** bump `venues.updated_at` — no feedback loop.

- **Nightly cron:** `autotag-venues-nightly` (pg_cron, 09:10 UTC = 4:10am CT) → `public.invoke_autotag()` → pg_net POST to the function with `mode=apply&limit=60`, authed by `x-autotag-token` (token in `private.autotag_job_tokens`, mirroring the geocode pattern).
- **Manual:** call the function with `venue_ids=[…]` after editing a venue, or `mode=dry-run` to preview.

## Run QA (verifying the verifier)

After a backfill or when spot-checking:

```sql
-- Coverage
select count(*) filter (where not exists (select 1 from venue_tags vt where vt.venue_id=v.id)) as zero_tag,
       round(avg((select count(*) from venue_tags vt where vt.venue_id=v.id)),1) as avg_tags
from venues v where status='published';

-- What was auto-applied, with evidence
select v.name, at.slug, ts.confidence, ts.source, ts.evidence
from tag_suggestions ts join venues v on v.id=ts.venue_id join approved_tags at on at.id=ts.tag_id
where ts.applied_at is not null order by ts.applied_at desc limit 50;

-- Pending review queue (includes all identity tags)
select v.name, at.slug, at.category, ts.confidence, ts.evidence
from tag_suggestions ts join venues v on v.id=ts.venue_id join approved_tags at on at.id=ts.tag_id
where ts.applied_at is null and ts.rejected_at is null
order by ts.confidence desc;
```

Approve a pending suggestion: insert into `venue_tags` + set `applied_at=now(), reviewed_by=<uuid>`. Reject: set `rejected_at=now()` (becomes a permanent tombstone).

## Rollback

Every applied row is auditable, so a bad run can be reversed precisely:

```sql
-- Remove everything a specific run applied
delete from venue_tags vt using tag_suggestions ts
where ts.venue_id=vt.venue_id and ts.tag_id=vt.tag_id
  and ts.applied_at >= '<run started_at>' and ts.source like 'autotag:%';
update tag_suggestions set applied_at=null where applied_at >= '<run started_at>' and source like 'autotag:%';
```

Portal caveat: the org venue-edit form rewrites `venue_tags` wholesale on save (delete-all + insert selection). Auto-applied tags appear pre-checked in that form, so they survive normal saves; a human unchecking one is treated as intentional removal (and should be paired with a rejection tombstone if it must not come back — the portal doesn't write tombstones yet; post-MVP todo).
