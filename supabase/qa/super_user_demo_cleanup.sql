-- Cleanup for local-only Super User demo QA records.

BEGIN;

CREATE TEMP TABLE qa_demo_users AS
SELECT id
FROM auth.users
WHERE email IN (
  'qa-demo-regular@happitime.test',
  'qa-demo-super@happitime.test',
  'qa-demo-admin@happitime.test',
  'qa-api-probe@happitime.test'
);

DELETE FROM public.guide_submissions
WHERE guide_id IN (
  SELECT id FROM public.guides WHERE slug LIKE 'qa-demo-guide-%'
);

DELETE FROM public.guides
WHERE slug LIKE 'qa-demo-guide-%'
   OR id IN (
     '32000000-0000-4000-8000-000000000001',
     '32000000-0000-4000-8000-000000000002',
     '32000000-0000-4000-8000-000000000003',
     '32000000-0000-4000-8000-000000000004'
   );

DELETE FROM public.user_preferences
WHERE user_id IN (SELECT id FROM qa_demo_users);

DELETE FROM public.user_profiles
WHERE user_id IN (SELECT id FROM qa_demo_users)
   OR handle IN ('qa_demo_regular', 'qa_demo_super', 'qa_demo_admin');

DELETE FROM public.admin_users
WHERE email = 'qa-demo-admin@happitime.test';

DELETE FROM auth.identities
WHERE user_id IN (SELECT id FROM qa_demo_users);

DELETE FROM auth.users
WHERE email IN (
  'qa-demo-regular@happitime.test',
  'qa-demo-super@happitime.test',
  'qa-demo-admin@happitime.test',
  'qa-api-probe@happitime.test'
);

COMMIT;

SELECT 'cleaned' AS status;
