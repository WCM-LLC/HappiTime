# Tastemaker-Proposed Events — Design

**Status:** In this PR (console). Mobile entry point is a follow-up.
**Date:** 2026-10-21
**Builds on:** self-serve intake (`20260812000945`, `20260812150500`, `20260812190000`) and the super-user console (`docs/super-user-role.md`).

## The gap

A Tastemaker (HappiTime Insider, `super_user`) hosts nights — a First Friday, a watch party — and
the program promises their event will be "listed and pushed." But `venue_events` inserts are
limited to venue members and platform admins, so every Tastemaker event has been typed in by J.
The only self-serve path was to photograph a flyer and run it through vision intake, which is
the wrong tool for an event the Tastemaker is organising themself.

## The idea: a form that produces exactly what a flyer scan produces

No new queue, no new table, no new approval UI. A Tastemaker fills in a form at
`/dashboard/events/new`; the server action turns it into a `ProposedEvent` and runs it through
`buildEventRows` — the same function the intake commit route uses — so the result is a draft
`venue_events` row with `created_by_tier = 'super_user'`, plus an `intake_submissions` row
(`tier = 'super_user'`, `content_type = 'event' | 'event_series'`, `menu_id = null`) linked
through `intake_submission_events`. `resolveReviewRoute` picks the reviewer: the venue's org
when it has an owner/admin, otherwise HappiTime staff. The existing queues at
`/orgs/[orgId]/intake-review` and `/admin/intake-review` already render events-only submissions.

An admin using the same form skips the queue and publishes at once, the way an admin's intake
commit does.

## Decisions (with J, 2026-10-21)

| Decision | Choice | Why |
|---|---|---|
| **Approval publishes** | Yes, for events-only submissions | An event is time-bound. Since #178 approval has not published anything — the owner publishes separately — and for a menu that is right. For an event, a second step the owner never takes means the night passes unlisted. Menus keep the two-step. |
| Entry point | Console first; mobile as a follow-up PR | Ships without an app release. |
| Venue scope | Any published venue | Same rule as a super user's intake scan (`canUseIntakeForVenue`). |
| Reviewer | Org if it has an approver, else admin | `resolveReviewRoute`, unchanged. J's words: "ultimately the owner/manager approves; in the meantime admin or Super Admin." Both are the same routing rule. |
| Validation | `utils/tastemakerEvent.mjs`, pure, tested at the repo root | The form is the only new input surface; everything after it is the intake pipeline. |
| Attribution | `created_by_tier = 'super_user'`, `published_at` stamped on approval | Scores on the contributor board as an event (3 pts) under the existing rules, once live. |

## What the Tastemaker sees

- `/dashboard/events` — their events, newest first, with a status: *Waiting on the venue* /
  *Waiting on HappiTime* / *Live* / *Not approved* (with the reviewer's reason) / *Ended*.
  Reads with the service client filtered to `created_by = auth.uid()` because draft events are
  invisible to their author under RLS, the same pattern `/dashboard/referrals` uses.
- `/dashboard/events/new` — venue (published only), title, type, one date or weekly days, start
  and optional end time, details, cover/price line, optional http(s) link.
- "Events" link on the dashboard home next to Guides, Referrals, Profile.

Gated like the other super-user routes: `EVENTS_PATH` is in `SUPER_USER_PATHS`
(middleware) and `events/layout.tsx` re-checks the role.

## The one behaviour change outside the new pages

`approveSubmission` in `utils/intake-review.ts`: when the submission has no menu, the linked
events still in `draft` are set to `published` with `published_at = now()` before the decision is
recorded. An event the owner already published, archived or canceled keeps its state. Menu
submissions are untouched.

This applies to every events-only submission, not just Tastemaker ones — an events-only flyer
scan by a super user goes live on approval too. An owner's own scan already published at commit,
so nothing changes for them.

## Not in this PR

- **Mobile entry** (`apps/mobile`): a "Propose an event" action on the venue screen posting to the
  same server action. Follow-up.
- Cover image upload for events. The row supports `cover_image_path`; the form does not ask yet.
- Editing or withdrawing a proposed event. Rejected ones show the reason; a new proposal is a new
  row.
- Notifying the Tastemaker when the event goes live beyond the existing intake decision email.

## Verification

- `npm run typecheck --workspace web`, `npm run lint --workspace web`: clean.
- `node --test test/tastemaker-event.test.mjs`: 5 passing (one-off, today-in-venue-zone,
  weekly series, error codes, URL scheme).
- The pages were not rendered in a browser in this session; the form's weekly/one-date toggle and
  the list's badges need a look in the running console before this is called done.
