/**
 * Match-or-create an organization for a staged-venue promotion.
 *
 * Mirrors how the app already creates orgs (see `createOrganization` in
 * dashboard-actions.ts): dedup is by SLUG. The richer normalize_organization_name
 * SQL function was dropped in the 2026-06-01 reconciliation, so slug is the
 * canonical match key. `slugify` strips apostrophes + lowercases, so
 * "O'Dowd's" / "Odowds" / "ODOWDS" all collapse to the same slug.
 *
 * Caller supplies the precomputed slug (via apps/web/src/utils/slugify.ts) so
 * this helper stays pure DB-I/O and testable in isolation.
 *
 * Use the service-role admin client — admin-created orgs are intentionally
 * OWNERLESS (no org_members row); the venue owner claims them later.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ name: string, slug: string, createdBy?: string | null }} input
 * @returns {Promise<{ orgId: string, orgName: string, created: boolean }>}
 */
export async function resolveOrgForVenue(supabase, { name, slug, createdBy = null }) {
  const orgName = String(name ?? "").trim();
  if (!orgName) throw new Error("name is required to resolve an org");
  if (!slug) throw new Error("slug is required to resolve an org");

  // 1) Reuse an existing org with the same slug.
  const existingId = await findOrgIdBySlug(supabase, slug);
  if (existingId) return { orgId: existingId, orgName, created: false };

  // 2) Create. Retry with a numeric suffix only if the slug collides with a
  //    DIFFERENT org; a same-name concurrent create resolves to a reuse.
  let candidate = slug;
  for (let attempt = 1; attempt <= 6; attempt++) {
    const { data, error } = await supabase
      .from("organizations")
      .insert({ name: orgName, slug: candidate, created_by: createdBy })
      .select("id")
      .single();

    if (!error && data) return { orgId: data.id, orgName, created: true };
    if (error && error.code !== "23505") throw new Error(error.message);

    // Unique violation on slug: re-check whether an org now owns this slug
    // (concurrent create) and reuse it; otherwise try a suffixed slug.
    const raced = await findOrgIdBySlug(supabase, candidate);
    if (raced) return { orgId: raced, orgName, created: false };
    candidate = `${slug}-${attempt + 1}`;
  }
  throw new Error("Could not generate a unique org slug. Try again.");
}

async function findOrgIdBySlug(supabase, slug) {
  const { data, error } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.id ?? null;
}
