-- Cleanup: remove the 34 "I'm here" tap rows that were recorded as check-ins.
--
-- Context: docs/superpowers/specs/2026-09-14-anonymous-checkins-root-cause.md
-- Snapshot (restore source): ./venue_attribution_events_app_checkin_taps_snapshot_2026-09-14.json
--
-- WHAT IS DELETED: venue_attribution_events rows where source='app_checkin'
--   AND session_id IS NOT NULL. Only the removed VenuePreviewScreen "I'm here"
--   button ever wrote app_checkin WITH a session_id (via track-visit). The real
--   check-in writer, verify-checkin, never sets session_id — those 8 rows are
--   untouched, and they match public.checkins 1:1.
--
-- WHAT IS NOT TOUCHED: public.checkins, public.venue_visits (the user-facing
--   Check Ins tab), every other attribution source.
--
-- HOW TO RUN (repo policy, CLAUDE.md "Running SQL against prod"):
--   supabase db query --linked -f docs/superpowers/specs/2026-09-14-anonymous-checkins/cleanup_app_checkin_taps.sql
--
--   Pass 1 — leave the ROLLBACK at the bottom. Confirm the three counts print
--            34 / 34 / 8 and that the second SELECT lists exactly 34 ids.
--   Pass 2 — swap ROLLBACK for COMMIT and run again. Verify in a *fresh*
--            session afterward:
--              select source, count(*), count(*) filter (where session_id is null)
--              from public.venue_attribution_events where source='app_checkin' group by 1;
--            expect: app_checkin | 8 | 8
--
-- No trigger bypass needed (no triggers on venue_attribution_events), so no
-- session_replication_role. Plain transaction.

begin;

-- Guard 1: the population is exactly what the snapshot captured (34 rows).
select count(*) as tap_rows_to_delete
from public.venue_attribution_events
where source = 'app_checkin' and session_id is not null;

-- Guard 2: every one of those ids is in the snapshot. If this returns fewer
-- than 34, a new tap landed after the snapshot (old app build still in the
-- wild) — stop, re-snapshot, re-run.
select count(*) as ids_covered_by_snapshot
from public.venue_attribution_events
where source = 'app_checkin' and session_id is not null
  and id in (
    '2f37c5ac-161f-45dd-9398-12e4f979831d','4dea787a-ebc1-4ec4-8488-ee2cde09efd5',
    '4d4e9f4f-8014-4356-b648-b317c6ba2d90','a9fb5a0c-37d1-4d0e-abe1-22fb7f004888',
    '1817a90d-1d74-47a2-bd27-8d95dbff686a','2abe040a-5b6f-4968-b02c-27f7ee1920ed',
    '301dcc27-16bc-4a50-a508-eaf94f966246','6c6b39dc-ab25-4129-ad87-22b9bbeec4c2',
    '982750f9-9096-438a-a1f1-0c0e1fb14222','96ca1329-ae21-4250-b1da-658ac8c14c0f',
    'a8ee5dd0-2fa6-43f9-8408-e794077cdccf','5b9842be-f7fd-466a-bb82-0c7a518aa51a',
    '3bd573a7-77af-4db5-8cef-19386a6fc63c','00b9c12f-82b6-46bf-80f6-922f68dc2ab0',
    '8356ed70-b773-4338-a917-d9b13de1334c','e4e56589-e76f-4e6f-b77a-55068d31dc4a',
    '8f664785-ebd8-4c38-ab70-849294422382','4f6f24f3-908e-47da-8601-9fd76ac05cbf',
    '3d6b2176-3a49-4613-88d3-ebe4db1dca0d','c4a53cab-6ca6-49a3-a68d-f37395f32b0a',
    '66c24b8f-2de4-4fb4-ac9e-3704935ba3da','bfae917b-d77c-4a25-ad27-2aee2d219a48',
    'f6fe914b-00be-4478-8912-6413f13d4c99','7be7fca1-7f8f-4890-ba14-6ca45c163164',
    '178cb0c0-6b25-43a7-8662-97ff04c38b61','68046a24-b5d4-4b51-8ed3-deed6829624e',
    'b1942087-3375-489d-9539-47f0d5cf27ee','66a90e0f-8fe8-40df-b531-941c5bc830bd',
    '9e22cf88-b9ee-4617-9116-5668ca9061dc','a82eb1da-090e-4d16-8dce-0bb8afebbb5c',
    'db38e1c4-4f5f-419b-83a9-e170b15818f7','84a8a5b1-53ae-4c54-afca-773b49260673',
    'fed362d9-9812-402c-a1d8-de7f74d739f1','e5dfd4eb-2c8a-4b1c-adc2-b86507338908'
  );

-- Guard 3: the real check-ins are exactly the session-less rows and match checkins 1:1.
select
  (select count(*) from public.venue_attribution_events
     where source='app_checkin' and session_id is null) as real_checkin_attr_rows,
  (select count(*) from public.checkins) as checkins_rows;

-- The delete. Scoped to the snapshot ids AND the predicate, so it can never
-- take a row the snapshot doesn't hold.
delete from public.venue_attribution_events
where source = 'app_checkin' and session_id is not null
  and id in (
    '2f37c5ac-161f-45dd-9398-12e4f979831d','4dea787a-ebc1-4ec4-8488-ee2cde09efd5',
    '4d4e9f4f-8014-4356-b648-b317c6ba2d90','a9fb5a0c-37d1-4d0e-abe1-22fb7f004888',
    '1817a90d-1d74-47a2-bd27-8d95dbff686a','2abe040a-5b6f-4968-b02c-27f7ee1920ed',
    '301dcc27-16bc-4a50-a508-eaf94f966246','6c6b39dc-ab25-4129-ad87-22b9bbeec4c2',
    '982750f9-9096-438a-a1f1-0c0e1fb14222','96ca1329-ae21-4250-b1da-658ac8c14c0f',
    'a8ee5dd0-2fa6-43f9-8408-e794077cdccf','5b9842be-f7fd-466a-bb82-0c7a518aa51a',
    '3bd573a7-77af-4db5-8cef-19386a6fc63c','00b9c12f-82b6-46bf-80f6-922f68dc2ab0',
    '8356ed70-b773-4338-a917-d9b13de1334c','e4e56589-e76f-4e6f-b77a-55068d31dc4a',
    '8f664785-ebd8-4c38-ab70-849294422382','4f6f24f3-908e-47da-8601-9fd76ac05cbf',
    '3d6b2176-3a49-4613-88d3-ebe4db1dca0d','c4a53cab-6ca6-49a3-a68d-f37395f32b0a',
    '66c24b8f-2de4-4fb4-ac9e-3704935ba3da','bfae917b-d77c-4a25-ad27-2aee2d219a48',
    'f6fe914b-00be-4478-8912-6413f13d4c99','7be7fca1-7f8f-4890-ba14-6ca45c163164',
    '178cb0c0-6b25-43a7-8662-97ff04c38b61','68046a24-b5d4-4b51-8ed3-deed6829624e',
    'b1942087-3375-489d-9539-47f0d5cf27ee','66a90e0f-8fe8-40df-b531-941c5bc830bd',
    '9e22cf88-b9ee-4617-9116-5668ca9061dc','a82eb1da-090e-4d16-8dce-0bb8afebbb5c',
    'db38e1c4-4f5f-419b-83a9-e170b15818f7','84a8a5b1-53ae-4c54-afca-773b49260673',
    'fed362d9-9812-402c-a1d8-de7f74d739f1','e5dfd4eb-2c8a-4b1c-adc2-b86507338908'
  );

-- Post-state inside the transaction: expect app_checkin rows = 8, all session-less.
select source, count(*) as n, count(*) filter (where session_id is null) as sessionless
from public.venue_attribution_events
where source = 'app_checkin'
group by 1;

rollback;   -- dry run. Change to `commit;` for pass 2.
