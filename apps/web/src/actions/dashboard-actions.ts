"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";
import { slugify } from "@/utils/slugify";
import { hasAdminEmailsConfigured, isAdmin, getAdminClient } from "@/utils/admin";

const ORGANIZATION_ALREADY_EXISTS = "organization_already_exists";

/** Returns the org ID for a given slug, or null if the slug is unclaimed. */
async function findOrganizationIdBySlug(dbClient: SupabaseClient, slug: string) {
  const { data, error } = await dbClient
    .from("organizations")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error("[dashboard] organization slug lookup failed", error);
    return null;
  }

  return data?.id ? String(data.id) : null;
}

/**
 * If the user is already a member of an existing org with this slug, redirects them to it.
 * Otherwise redirects to the dashboard with an organization_already_exists error.
 */
async function redirectForExistingOrganization(
  dbClient: SupabaseClient,
  orgId: string,
  userId: string
): Promise<never> {
  const { data: membership, error } = await dbClient
    .from("org_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!error && membership) {
    redirect(`/orgs/${orgId}`);
  }

  redirect(`/dashboard?error=${ORGANIZATION_ALREADY_EXISTS}`);
}

/**
 * Handles the race-condition path where a unique-constraint violation means another
 * org claimed the same slug between the initial check and the insert.
 */
async function redirectForDuplicateOrganizationSlug(
  dbClient: SupabaseClient,
  slug: string,
  userId: string
): Promise<never> {
  const existingOrgId = await findOrganizationIdBySlug(dbClient, slug);

  if (existingOrgId) {
    await redirectForExistingOrganization(dbClient, existingOrgId, userId);
  }

  redirect(`/dashboard?error=${ORGANIZATION_ALREADY_EXISTS}`);
}

/**
 * Server action: creates a new organization and adds the creator as owner.
 * Admin users use a service-role client to bypass the org_members insert RLS policy
 * which would otherwise fail before the membership row exists.
 */
export async function createOrganization(formData: FormData) {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) redirect("/login");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect("/dashboard?error=missing_org_name");

  const slug = slugify(name);

  // Admin users bypass RLS via service role client — necessary because the
  // org_members insert policy does a sub-SELECT on organizations, which is
  // filtered by SELECT RLS before the user has any membership row.
  const useAdmin = hasAdminEmailsConfigured() && (await isAdmin());
  const dbClient = useAdmin ? getAdminClient() : supabase;

  const existingOrgId = await findOrganizationIdBySlug(dbClient, slug);
  if (existingOrgId) {
    await redirectForExistingOrganization(dbClient, existingOrgId, user.id);
  }

  // 1) Create org
  const { data: org, error: orgErr } = await dbClient
    .from("organizations")
    .insert({ name, slug, created_by: user.id })
    .select("id")
    .single();

  if (orgErr || !org) {
    if (orgErr?.code === "23505") {
      await redirectForDuplicateOrganizationSlug(dbClient, slug, user.id);
    }

    redirect(`/dashboard?error=${encodeURIComponent(orgErr?.message ?? "org_create_failed")}`);
  }

  // 2) Create membership for creator
  const { error: memErr } = await dbClient
    .from("org_members")
    .insert({ org_id: org.id, user_id: user.id, role: "owner", email: user.email ?? null });

  if (memErr) {
    redirect(`/dashboard?error=${encodeURIComponent(memErr.message)}`);
  }

  // ✅ important
  revalidatePath("/dashboard");
  redirect(`/orgs/${org.id}`);
}

export async function updateOrganization(orgId: string, formData: FormData) {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) redirect("/login");

  const { data: membership, error: membershipErr } = await supabase
    .from("org_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipErr || !membership || String(membership.role) !== "owner") {
    redirect("/dashboard?error=not_org_owner");
  }

  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect("/dashboard?error=missing_org_name");

  const slugInput = String(formData.get("slug") ?? "").trim();
  const slug = slugify(slugInput || name);

  const { error } = await supabase
    .from("organizations")
    .update({ name, slug })
    .eq("id", orgId);

  if (error) {
    if (error.code === "23505") {
      redirect("/dashboard?error=slug_taken");
    }

    redirect(`/dashboard?error=${encodeURIComponent(error.message ?? "org_update_failed")}`);
  }

  revalidatePath("/dashboard");
  revalidatePath(`/orgs/${orgId}`);
}

export async function deleteOrganization(orgId: string, _formData: FormData) {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) redirect("/login");

  const { data: membership, error: membershipErr } = await supabase
    .from("org_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipErr || !membership || String(membership.role) !== "owner") {
    redirect("/dashboard?error=not_org_owner");
  }

  const { error } = await supabase
    .from("organizations")
    .delete()
    .eq("id", orgId);

  if (error) {
    redirect(`/dashboard?error=${encodeURIComponent(error.message ?? "org_delete_failed")}`);
  }

  revalidatePath("/dashboard");
  revalidatePath(`/orgs/${orgId}`);
  redirect("/dashboard");
}
