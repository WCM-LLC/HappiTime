-- Local-only QA data for the Super User demo pipeline.
-- Create Auth users first via the local Auth Admin API, then run this SQL.
-- Pairs with supabase/qa/super_user_demo_cleanup.sql.

BEGIN;

DO $$
DECLARE
  regular_id uuid;
  super_id uuid;
  admin_id uuid;
BEGIN
  SELECT id INTO regular_id FROM auth.users WHERE email = 'qa-demo-regular@happitime.test';
  SELECT id INTO super_id FROM auth.users WHERE email = 'qa-demo-super@happitime.test';
  SELECT id INTO admin_id FROM auth.users WHERE email = 'qa-demo-admin@happitime.test';

  IF regular_id IS NULL OR super_id IS NULL OR admin_id IS NULL THEN
    RAISE EXCEPTION 'Missing QA auth users. Create qa-demo-regular@happitime.test, qa-demo-super@happitime.test, and qa-demo-admin@happitime.test first.';
  END IF;

  INSERT INTO public.admin_users (email, created_by)
  VALUES ('qa-demo-admin@happitime.test', 'qa-super-user-demo-seed')
  ON CONFLICT (email) DO NOTHING;

  INSERT INTO public.user_profiles (
    user_id,
    handle,
    display_name,
    avatar_url,
    bio,
    is_public,
    role,
    auto_publish_enabled
  )
  VALUES
    (
      regular_id,
      'qa_demo_regular',
      'QA Demo Regular User',
      NULL,
      'QA regular user for Super User demo verification.',
      true,
      'user',
      false
    ),
    (
      super_id,
      'qa_demo_super',
      'QA Demo Super User',
      NULL,
      'QA Super User for guide authoring demo verification.',
      true,
      'super_user',
      false
    ),
    (
      admin_id,
      'qa_demo_admin',
      'QA Demo Super Admin',
      NULL,
      'QA Super Admin for guide review demo verification.',
      true,
      'user',
      false
    )
  ON CONFLICT (user_id) DO UPDATE
  SET handle = EXCLUDED.handle,
      display_name = EXCLUDED.display_name,
      avatar_url = EXCLUDED.avatar_url,
      bio = EXCLUDED.bio,
      is_public = EXCLUDED.is_public,
      role = EXCLUDED.role,
      auto_publish_enabled = EXCLUDED.auto_publish_enabled,
      updated_at = now();

  INSERT INTO public.user_preferences (user_id, home_city, home_state, onboarding_completed_at, onboarding_step)
  VALUES
    (regular_id, 'Kansas City', 'MO', now(), 'complete'),
    (super_id, 'Kansas City', 'MO', now(), 'complete'),
    (admin_id, 'Kansas City', 'MO', now(), 'complete')
  ON CONFLICT (user_id) DO UPDATE
  SET home_city = EXCLUDED.home_city,
      home_state = EXCLUDED.home_state,
      onboarding_completed_at = EXCLUDED.onboarding_completed_at,
      onboarding_step = EXCLUDED.onboarding_step,
      updated_at = now();

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
    (
      '32000000-0000-4000-8000-000000000001',
      'qa-demo-guide-draft',
      'QA Demo Guide Draft',
      'Draft guide for demo verification.',
      '# QA Demo Guide Draft\n\nThis draft should stay private.',
      super_id,
      'draft',
      'Kansas City',
      ARRAY['qa', 'demo'],
      NULL
    ),
    (
      '32000000-0000-4000-8000-000000000002',
      'qa-demo-guide-pending',
      'QA Demo Guide Pending',
      'Pending guide for preview and approval verification.',
      '# QA Demo Guide Pending\n\nThis guide should appear in admin review and stay off the public directory until approved.',
      super_id,
      'pending_review',
      'Kansas City',
      ARRAY['qa', 'demo'],
      NULL
    ),
    (
      '32000000-0000-4000-8000-000000000003',
      'qa-demo-guide-published',
      'QA Demo Guide Published',
      'Published guide for public directory verification.',
      '# QA Demo Guide Published\n\nThis guide should be visible publicly.',
      super_id,
      'published',
      'Kansas City',
      ARRAY['qa', 'demo'],
      now()
    ),
    (
      '32000000-0000-4000-8000-000000000004',
      'qa-demo-guide-rejected',
      'QA Demo Guide Rejected',
      'Rejected guide returned to draft for visibility verification.',
      '# QA Demo Guide Rejected\n\nThis rejected guide should stay private.',
      super_id,
      'draft',
      'Kansas City',
      ARRAY['qa', 'demo'],
      NULL
    )
  ON CONFLICT (id) DO UPDATE
  SET slug = EXCLUDED.slug,
      title = EXCLUDED.title,
      subtitle = EXCLUDED.subtitle,
      body_md = EXCLUDED.body_md,
      author_id = EXCLUDED.author_id,
      status = EXCLUDED.status,
      city = EXCLUDED.city,
      tags = EXCLUDED.tags,
      published_at = EXCLUDED.published_at,
      updated_at = now();

  INSERT INTO public.guide_submissions (guide_id, submitted_by, notes)
  VALUES
    ('32000000-0000-4000-8000-000000000002', super_id, 'QA pending submission seeded for admin preview.'),
    ('32000000-0000-4000-8000-000000000004', super_id, 'QA rejected submission history.'),
    ('32000000-0000-4000-8000-000000000004', NULL, 'QA rejection notes: return to draft before demo.')
  ON CONFLICT DO NOTHING;

  UPDATE public.guide_submissions
  SET reviewed_by = admin_id,
      reviewed_at = now(),
      decision = 'rejected',
      notes = 'QA rejection notes: return to draft before demo.'
  WHERE guide_id = '32000000-0000-4000-8000-000000000004'
    AND submitted_by IS NULL
    AND decision IS NULL;
END $$;

COMMIT;

SELECT
  'seeded' AS status,
  (SELECT count(*) FROM public.user_profiles WHERE handle LIKE 'qa_demo_%') AS profile_count,
  (SELECT count(*) FROM public.guides WHERE slug LIKE 'qa-demo-guide-%') AS guide_count,
  (SELECT count(*) FROM public.guide_submissions gs JOIN public.guides g ON g.id = gs.guide_id WHERE g.slug LIKE 'qa-demo-guide-%') AS submission_count;
