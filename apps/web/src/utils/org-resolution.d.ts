import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Match-or-create an organization for a staged-venue promotion (dedup by slug).
 * Use the service-role admin client; auto-created orgs are ownerless.
 */
export function resolveOrgForVenue(
  supabase: SupabaseClient,
  input: { name: string; slug: string; createdBy?: string | null },
): Promise<{ orgId: string; orgName: string; created: boolean }>;
