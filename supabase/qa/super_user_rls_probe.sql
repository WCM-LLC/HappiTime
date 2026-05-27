BEGIN;

CREATE TEMP TABLE qa_super_user_results (
  area text NOT NULL,
  check_name text NOT NULL,
  expected text NOT NULL,
  actual text NOT NULL,
  pass boolean NOT NULL,
  notes text
) ON COMMIT DROP;

DO $$
DECLARE
  regular_id uuid := '10000000-0000-4000-8000-000000000001';
  super_id uuid := '10000000-0000-4000-8000-000000000002';
  admin_id uuid := '10000000-0000-4000-8000-000000000003';
  draft_id uuid := '20000000-0000-4000-8000-000000000001';
  pending_id uuid := '20000000-0000-4000-8000-000000000002';
  published_id uuid := '20000000-0000-4000-8000-000000000003';
  archived_id uuid := '20000000-0000-4000-8000-000000000004';
  regular_guide_id uuid := '20000000-0000-4000-8000-000000000005';
  anon_probe_id uuid := '20000000-0000-4000-8000-000000000006';
  regular_probe_id uuid := '20000000-0000-4000-8000-000000000007';
  super_probe_id uuid := '20000000-0000-4000-8000-000000000008';
  row_count integer;
BEGIN
  INSERT INTO auth.users (
    id,
    aud,
    role,
    email,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  VALUES
    (regular_id, 'authenticated', 'authenticated', 'qa-rls-regular@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
    (super_id, 'authenticated', 'authenticated', 'qa-rls-super@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
    (admin_id, 'authenticated', 'authenticated', 'qa-rls-admin@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.admin_users (email, created_by)
  VALUES ('qa-rls-admin@example.test', 'qa-super-user-rls-probe')
  ON CONFLICT (email) DO NOTHING;

  INSERT INTO public.user_profiles (
    user_id,
    handle,
    display_name,
    is_public,
    role,
    auto_publish_enabled
  )
  VALUES
    (regular_id, 'qa_rls_regular', 'QA RLS Regular User', true, 'user', false),
    (super_id, 'qa_rls_super', 'QA RLS Super User', true, 'super_user', false),
    (admin_id, 'qa_rls_admin', 'QA RLS Admin User', true, 'user', false)
  ON CONFLICT (user_id) DO UPDATE
  SET handle = EXCLUDED.handle,
      display_name = EXCLUDED.display_name,
      is_public = EXCLUDED.is_public,
      role = EXCLUDED.role,
      auto_publish_enabled = EXCLUDED.auto_publish_enabled;

  INSERT INTO public.guides (
    id,
    slug,
    title,
    subtitle,
    body_md,
    author_id,
    status,
    city,
    tags,
    published_at
  )
  VALUES
    (draft_id, 'qa-rls-guide-draft', 'QA RLS Guide Draft', 'Draft visibility probe', '# Draft', super_id, 'draft', 'Kansas City', ARRAY['qa'], NULL),
    (pending_id, 'qa-rls-guide-pending', 'QA RLS Guide Pending', 'Pending visibility probe', '# Pending', super_id, 'pending_review', 'Kansas City', ARRAY['qa'], NULL),
    (published_id, 'qa-rls-guide-published', 'QA RLS Guide Published', 'Published visibility probe', '# Published', super_id, 'published', 'Kansas City', ARRAY['qa'], now()),
    (archived_id, 'qa-rls-guide-rejected', 'QA RLS Guide Rejected', 'Archived visibility probe', '# Archived', super_id, 'archived', 'Kansas City', ARRAY['qa'], NULL),
    (regular_guide_id, 'qa-rls-regular-guide', 'QA RLS Regular Guide', 'Regular-user ownership probe', '# Regular', regular_id, 'draft', 'Kansas City', ARRAY['qa'], NULL)
  ON CONFLICT (id) DO UPDATE
  SET slug = EXCLUDED.slug,
      title = EXCLUDED.title,
      subtitle = EXCLUDED.subtitle,
      body_md = EXCLUDED.body_md,
      author_id = EXCLUDED.author_id,
      status = EXCLUDED.status,
      city = EXCLUDED.city,
      tags = EXCLUDED.tags,
      published_at = EXCLUDED.published_at;

  INSERT INTO public.guide_submissions (guide_id, submitted_by, notes)
  VALUES (pending_id, super_id, 'QA pending submission row')
  ON CONFLICT DO NOTHING;

  -- Anonymous users can see only published guides.
  PERFORM set_config('request.jwt.claim.role', 'anon', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.email', '', true);
  EXECUTE 'SET LOCAL ROLE anon';
  SELECT count(*) INTO row_count
  FROM public.guides
  WHERE slug LIKE 'qa-rls-guide-%';
  EXECUTE 'RESET ROLE';
  INSERT INTO qa_super_user_results
  VALUES ('RLS', 'anon_published_only', '1 visible published QA guide', row_count::text, row_count = 1, NULL);

  -- Anonymous users cannot create guides.
  BEGIN
    PERFORM set_config('request.jwt.claim.role', 'anon', true);
    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claim.email', '', true);
    EXECUTE 'SET LOCAL ROLE anon';
    INSERT INTO public.guides (id, slug, title, body_md, author_id, status)
    VALUES (anon_probe_id, 'qa-rls-anon-write', 'QA RLS Anonymous Write', '# Should fail', NULL, 'draft');
    EXECUTE 'RESET ROLE';
    INSERT INTO qa_super_user_results
    VALUES ('RLS', 'anon_cannot_insert_guides', 'insert rejected', 'insert succeeded', false, NULL);
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO qa_super_user_results
    VALUES ('RLS', 'anon_cannot_insert_guides', 'insert rejected', SQLSTATE, true, SQLERRM);
  END;

  -- guide_submissions is not publicly readable. A hard permission denial is
  -- acceptable and preferred; an RLS-filtered 0-row result is also safe.
  BEGIN
    PERFORM set_config('request.jwt.claim.role', 'anon', true);
    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claim.email', '', true);
    EXECUTE 'SET LOCAL ROLE anon';
    SELECT count(*) INTO row_count
    FROM public.guide_submissions
    WHERE guide_id = pending_id;
    EXECUTE 'RESET ROLE';
    INSERT INTO qa_super_user_results
    VALUES ('RLS', 'anon_cannot_read_submissions', 'denied or 0 visible audit rows', row_count::text, row_count = 0, NULL);
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO qa_super_user_results
    VALUES ('RLS', 'anon_cannot_read_submissions', 'denied or 0 visible audit rows', SQLSTATE, true, SQLERRM);
  END;

  -- Regular authenticated users cannot self-promote.
  BEGIN
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
    PERFORM set_config('request.jwt.claim.sub', regular_id::text, true);
    PERFORM set_config('request.jwt.claim.email', 'qa-rls-regular@example.test', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    UPDATE public.user_profiles
    SET role = 'super_user'
    WHERE user_id = regular_id;
    GET DIAGNOSTICS row_count = ROW_COUNT;
    EXECUTE 'RESET ROLE';
    INSERT INTO qa_super_user_results
    VALUES ('RLS', 'regular_cannot_self_promote', 'update rejected or 0 rows', row_count::text, row_count = 0, NULL);
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO qa_super_user_results
    VALUES ('RLS', 'regular_cannot_self_promote', 'update rejected or 0 rows', SQLSTATE, true, SQLERRM);
  END;

  -- Regular authenticated users must not author Super User guide rows directly.
  BEGIN
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
    PERFORM set_config('request.jwt.claim.sub', regular_id::text, true);
    PERFORM set_config('request.jwt.claim.email', 'qa-rls-regular@example.test', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    INSERT INTO public.guides (id, slug, title, body_md, author_id, status)
    VALUES (regular_probe_id, 'qa-rls-regular-direct-write', 'QA RLS Regular Direct Write', '# Should fail', regular_id, 'draft');
    EXECUTE 'RESET ROLE';
    INSERT INTO qa_super_user_results
    VALUES ('RLS', 'regular_cannot_insert_guides', 'insert rejected', 'insert succeeded', false, NULL);
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO qa_super_user_results
    VALUES ('RLS', 'regular_cannot_insert_guides', 'insert rejected', SQLSTATE, true, SQLERRM);
  END;

  -- Super Users can create drafts.
  BEGIN
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
    PERFORM set_config('request.jwt.claim.sub', super_id::text, true);
    PERFORM set_config('request.jwt.claim.email', 'qa-rls-super@example.test', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    INSERT INTO public.guides (id, slug, title, body_md, author_id, status)
    VALUES (super_probe_id, 'qa-rls-super-direct-write', 'QA RLS Super Direct Write', '# Should pass', super_id, 'draft');
    EXECUTE 'RESET ROLE';
    INSERT INTO qa_super_user_results
    VALUES ('RLS', 'super_user_can_insert_draft', 'insert succeeds', 'insert succeeded', true, NULL);
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO qa_super_user_results
    VALUES ('RLS', 'super_user_can_insert_draft', 'insert succeeds', SQLSTATE, false, SQLERRM);
  END;

  -- Super Users cannot publish directly through client-side RLS.
  BEGIN
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
    PERFORM set_config('request.jwt.claim.sub', super_id::text, true);
    PERFORM set_config('request.jwt.claim.email', 'qa-rls-super@example.test', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    UPDATE public.guides
    SET status = 'published', published_at = now()
    WHERE id = draft_id;
    GET DIAGNOSTICS row_count = ROW_COUNT;
    EXECUTE 'RESET ROLE';
    INSERT INTO qa_super_user_results
    VALUES ('RLS', 'super_user_cannot_publish_directly', 'update rejected or 0 rows', row_count::text, row_count = 0, NULL);
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO qa_super_user_results
    VALUES ('RLS', 'super_user_cannot_publish_directly', 'update rejected or 0 rows', SQLSTATE, true, SQLERRM);
  END;

  -- Super Users can write submission audit rows for their own guides.
  BEGIN
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
    PERFORM set_config('request.jwt.claim.sub', super_id::text, true);
    PERFORM set_config('request.jwt.claim.email', 'qa-rls-super@example.test', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    INSERT INTO public.guide_submissions (guide_id, submitted_by, notes)
    VALUES (draft_id, super_id, 'QA self submission probe');
    EXECUTE 'RESET ROLE';
    INSERT INTO qa_super_user_results
    VALUES ('RLS', 'super_user_can_insert_own_submission', 'insert succeeds', 'insert succeeded', true, NULL);
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO qa_super_user_results
    VALUES ('RLS', 'super_user_can_insert_own_submission', 'insert succeeds', SQLSTATE, false, SQLERRM);
  END;

  -- Super Users cannot manage another author's guide.
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', super_id::text, true);
  PERFORM set_config('request.jwt.claim.email', 'qa-rls-super@example.test', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.guides
  SET title = 'QA Demo Regular Guide Hacked'
  WHERE id = regular_guide_id;
  GET DIAGNOSTICS row_count = ROW_COUNT;
  EXECUTE 'RESET ROLE';
  INSERT INTO qa_super_user_results
  VALUES ('RLS', 'super_user_cannot_update_other_author', '0 rows updated', row_count::text, row_count = 0, NULL);

  -- Super Admins can publish pending guides through RLS/admin policy.
  BEGIN
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
    PERFORM set_config('request.jwt.claim.sub', admin_id::text, true);
    PERFORM set_config('request.jwt.claim.email', 'qa-rls-admin@example.test', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    UPDATE public.guides
    SET status = 'published', published_at = now()
    WHERE id = pending_id;
    GET DIAGNOSTICS row_count = ROW_COUNT;
    EXECUTE 'RESET ROLE';
    INSERT INTO qa_super_user_results
    VALUES ('RLS', 'super_admin_can_publish_pending', '1 row updated', row_count::text, row_count = 1, NULL);
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO qa_super_user_results
    VALUES ('RLS', 'super_admin_can_publish_pending', '1 row updated', SQLSTATE, false, SQLERRM);
  END;

  -- Regular users cannot read another author's guide_submissions audit trail.
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', regular_id::text, true);
  PERFORM set_config('request.jwt.claim.email', 'qa-rls-regular@example.test', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO row_count
  FROM public.guide_submissions
  WHERE guide_id = pending_id;
  EXECUTE 'RESET ROLE';
  INSERT INTO qa_super_user_results
  VALUES ('RLS', 'regular_cannot_read_other_submissions', '0 visible audit rows', row_count::text, row_count = 0, NULL);
END $$;

SELECT
  area,
  check_name,
  expected,
  actual,
  pass,
  notes
FROM qa_super_user_results
ORDER BY area, check_name;

ROLLBACK;
