import { createClient } from '@/utils/supabase/server';
import { isAdminEmail } from '@/utils/admin-emails';

/**
 * Gate for /api/places/* proxy routes: any signed-in console user who is a
 * platform admin OR belongs to at least one org. Role-agnostic by design so
 * the future self-serve owner claim/add flow needs no rework. The Google key
 * stays server-side; this gate just keeps the proxy from being an open
 * anonymous Places relay.
 */
export async function canUsePlacesProxy(): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  if (await isAdminEmail(user.email)) return true;
  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  return membership != null;
}

/** Server-side Google key; mirrors the edge functions' env fallback order. */
export function getPlacesKey(): string | null {
  return (
    process.env.GOOGLE_PLACES_API_KEY ??
    process.env.GOOGLE_GEOCODING_API_KEY ??
    null
  );
}
