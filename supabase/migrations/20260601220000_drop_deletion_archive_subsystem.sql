-- Schema-drift reconciliation, Stage 8: drop the user-deletion archival subsystem to match
-- prod (user-approved; prod = intended target).
-- Plan: docs/superpowers/plans/2026-06-01-schema-drift-reconciliation.md
--
-- The "archive a user's data before auth.users delete" subsystem was created by
-- 20260504102812_account_deletion_cleanup.sql, ran on prod, then was cleanly removed from prod
-- out-of-band (trigger + function + tables all gone together; user deletion works without it).
-- Decision: drop it so a fresh replay matches prod (avoids retaining deleted-user data, which
-- is in tension with GDPR right-to-erasure). NO-OP on prod (already absent).

drop trigger  if exists archive_auth_user_before_delete on auth.users;
drop function if exists app_private.archive_auth_user_before_delete() cascade;
drop table    if exists app_private.deleted_user_data_archive_items cascade;
drop table    if exists app_private.deleted_user_data_archives cascade;
