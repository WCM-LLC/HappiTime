-- Prevent authenticated users from self-assigning privileged guide permissions.
--
-- user_profiles.role and user_profiles.auto_publish_enabled drive the guide
-- authorization and auto-publish workflow. Keep those columns writable only by
-- trusted server/admin paths (for example, service_role) while preserving the
-- existing owner-managed profile fields for authenticated users.

REVOKE INSERT, UPDATE ON TABLE public.user_profiles FROM authenticated;

GRANT INSERT (
  user_id,
  handle,
  display_name,
  avatar_url,
  bio,
  is_public,
  created_at,
  updated_at
) ON TABLE public.user_profiles TO authenticated;

GRANT UPDATE (
  user_id,
  handle,
  display_name,
  avatar_url,
  bio,
  is_public,
  created_at,
  updated_at
) ON TABLE public.user_profiles TO authenticated;
