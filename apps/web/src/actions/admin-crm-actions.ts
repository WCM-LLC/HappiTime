'use server';

// CRM server actions — admin-only (assertAdmin + service-role client).
// All writes go through here; RLS on crm_* tables is defense-in-depth.

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { assertAdmin, getAdminClient } from '@/utils/admin';
import { createClient } from '@/utils/supabase/server';
import {
  CRM_STAGES, CRM_LOST_REASONS, CRM_LEAD_SOURCES, CRM_TIERS,
  CRM_PRIORITIES, CRM_ACTIVITY_TYPES,
} from '@/utils/crm';

function str(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  const s = typeof v === 'string' ? v.trim() : '';
  return s.length > 0 ? s : null;
}

function requireStr(formData: FormData, key: string): string {
  const v = str(formData, key);
  if (!v) throw new Error(`${key} is required`);
  return v;
}

function oneOf<T extends readonly string[]>(value: string | null, allowed: T, label: string): T[number] | null {
  if (value == null) return null;
  if (!(allowed as readonly string[]).includes(value)) throw new Error(`Invalid ${label}`);
  return value;
}

/** Parse a dollars string ("250" or "250.00") into integer cents, or null. */
function dollarsToCents(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value.replace(/[$,]/g, ''));
  if (!Number.isFinite(n) || n < 0) throw new Error('Invalid estimated value');
  return Math.round(n * 100);
}

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

function leadFieldsFrom(formData: FormData) {
  return {
    name: requireStr(formData, 'name'),
    website: str(formData, 'website'),
    phone: str(formData, 'phone'),
    email: str(formData, 'email'),
    city: str(formData, 'city'),
    neighborhood: str(formData, 'neighborhood'),
    lead_source: oneOf(str(formData, 'lead_source'), CRM_LEAD_SOURCES, 'lead source') ?? 'other',
    priority: oneOf(str(formData, 'priority'), CRM_PRIORITIES, 'priority') ?? 'medium',
    interested_tier: oneOf(str(formData, 'interested_tier'), CRM_TIERS, 'tier'),
    estimated_monthly_value_cents: dollarsToCents(str(formData, 'estimated_monthly_value')),
    next_follow_up_at: str(formData, 'next_follow_up_at'),
    notes: str(formData, 'notes'),
  };
}

// ── Leads ──────────────────────────────────────────────

export async function createCrmLead(formData: FormData) {
  await assertAdmin();
  const supabase = getAdminClient();
  const fields = leadFieldsFrom(formData);
  const venueId = str(formData, 'venue_id');
  const orgId = str(formData, 'organization_id');
  const createdBy = await currentUserId();

  const insert: Record<string, unknown> = { ...fields, created_by: createdBy, owner_user_id: createdBy };
  if (venueId) insert.venue_id = venueId;
  if (orgId) insert.organization_id = orgId;

  const { data, error } = await supabase.from('crm_leads').insert(insert).select('id').single();
  if (error) throw new Error(`Failed to create lead: ${error.message}`);

  revalidatePath('/admin/crm');
  redirect(`/admin/crm/leads/${data.id}`);
}

export async function updateCrmLead(formData: FormData) {
  await assertAdmin();
  const supabase = getAdminClient();
  const id = requireStr(formData, 'lead_id');
  const fields = leadFieldsFrom(formData);
  const { error } = await supabase.from('crm_leads').update(fields).eq('id', id);
  if (error) throw new Error(`Failed to update lead: ${error.message}`);
  revalidatePath(`/admin/crm/leads/${id}`);
  revalidatePath('/admin/crm');
}

export async function changeCrmLeadStage(formData: FormData) {
  await assertAdmin();
  const supabase = getAdminClient();
  const id = requireStr(formData, 'lead_id');
  const stage = oneOf(requireStr(formData, 'stage'), CRM_STAGES, 'stage');
  const lostReason = stage === 'lost'
    ? oneOf(str(formData, 'lost_reason') ?? 'other', CRM_LOST_REASONS, 'lost reason')
    : null;

  const { data: before, error: fetchError } = await supabase
    .from('crm_leads').select('stage').eq('id', id).single();
  if (fetchError) throw new Error(`Lead not found: ${fetchError.message}`);
  if (before.stage === stage) return;

  const { error } = await supabase
    .from('crm_leads')
    .update({ stage, lost_reason: lostReason })
    .eq('id', id);
  if (error) throw new Error(`Failed to change stage: ${error.message}`);

  await supabase.from('crm_activities').insert({
    lead_id: id,
    activity_type: 'stage_change',
    subject: `Stage: ${before.stage} → ${stage}`,
    body: lostReason ? `Lost reason: ${lostReason}` : null,
    created_by: await currentUserId(),
  });

  revalidatePath(`/admin/crm/leads/${id}`);
  revalidatePath('/admin/crm');
  revalidatePath('/admin/crm/pipeline');
}

export async function linkCrmLeadVenue(formData: FormData) {
  await assertAdmin();
  const supabase = getAdminClient();
  const id = requireStr(formData, 'lead_id');
  const venueId = str(formData, 'venue_id'); // null unlinks
  if (venueId) {
    const { data: venue, error } = await supabase
      .from('venues').select('id, org_id').eq('id', venueId).single();
    if (error) throw new Error('Venue not found');
    const { error: updateError } = await supabase
      .from('crm_leads')
      .update({ venue_id: venue.id, organization_id: venue.org_id })
      .eq('id', id);
    if (updateError) throw new Error(`Failed to link venue: ${updateError.message}`);
  } else {
    const { error } = await supabase.from('crm_leads').update({ venue_id: null }).eq('id', id);
    if (error) throw new Error(`Failed to unlink venue: ${error.message}`);
  }
  revalidatePath(`/admin/crm/leads/${id}`);
}

export async function linkCrmLeadOrganization(formData: FormData) {
  await assertAdmin();
  const supabase = getAdminClient();
  const id = requireStr(formData, 'lead_id');
  const orgId = str(formData, 'organization_id'); // null unlinks
  const { error } = await supabase.from('crm_leads').update({ organization_id: orgId }).eq('id', id);
  if (error) throw new Error(`Failed to link organization: ${error.message}`);
  revalidatePath(`/admin/crm/leads/${id}`);
}

export async function claimCrmLead(formData: FormData) {
  await assertAdmin();
  const supabase = getAdminClient();
  const id = requireStr(formData, 'lead_id');
  const userId = await currentUserId();
  const { error } = await supabase.from('crm_leads').update({ owner_user_id: userId }).eq('id', id);
  if (error) throw new Error(`Failed to claim lead: ${error.message}`);
  revalidatePath(`/admin/crm/leads/${id}`);
}

export async function setCrmLeadFollowUp(formData: FormData) {
  await assertAdmin();
  const supabase = getAdminClient();
  const id = requireStr(formData, 'lead_id');
  const followUpAt = str(formData, 'next_follow_up_at'); // null clears
  const { error } = await supabase
    .from('crm_leads').update({ next_follow_up_at: followUpAt }).eq('id', id);
  if (error) throw new Error(`Failed to set follow-up: ${error.message}`);

  if (followUpAt) {
    await supabase.from('crm_tasks').insert({
      lead_id: id,
      title: str(formData, 'title') ?? 'Follow up',
      due_at: followUpAt,
      assigned_to: await currentUserId(),
    });
  }
  revalidatePath(`/admin/crm/leads/${id}`);
  revalidatePath('/admin/crm/tasks');
  revalidatePath('/admin/crm');
}

// ── Contacts ──────────────────────────────────────────

export async function addCrmContact(formData: FormData) {
  await assertAdmin();
  const supabase = getAdminClient();
  const leadId = requireStr(formData, 'lead_id');
  const { error } = await supabase.from('crm_contacts').insert({
    lead_id: leadId,
    name: requireStr(formData, 'name'),
    title: str(formData, 'title'),
    email: str(formData, 'email'),
    phone: str(formData, 'phone'),
    preferred_contact_method: oneOf(str(formData, 'preferred_contact_method'), ['email', 'phone', 'text', 'in_person'] as const, 'contact method'),
    is_primary: formData.get('is_primary') === 'on',
    notes: str(formData, 'notes'),
  });
  if (error) throw new Error(`Failed to add contact: ${error.message}`);
  revalidatePath(`/admin/crm/leads/${leadId}`);
}

export async function deleteCrmContact(formData: FormData) {
  await assertAdmin();
  const supabase = getAdminClient();
  const leadId = requireStr(formData, 'lead_id');
  const id = requireStr(formData, 'contact_id');
  const { error } = await supabase.from('crm_contacts').delete().eq('id', id);
  if (error) throw new Error(`Failed to delete contact: ${error.message}`);
  revalidatePath(`/admin/crm/leads/${leadId}`);
}

// ── Activities ────────────────────────────────────────

export async function logCrmActivity(formData: FormData) {
  await assertAdmin();
  const supabase = getAdminClient();
  const leadId = requireStr(formData, 'lead_id');
  const { error } = await supabase.from('crm_activities').insert({
    lead_id: leadId,
    contact_id: str(formData, 'contact_id'),
    activity_type: oneOf(requireStr(formData, 'activity_type'), CRM_ACTIVITY_TYPES, 'activity type'),
    direction: oneOf(str(formData, 'direction'), ['outbound', 'inbound'] as const, 'direction'),
    subject: str(formData, 'subject'),
    body: str(formData, 'body'),
    outcome: str(formData, 'outcome'),
    created_by: await currentUserId(),
  });
  if (error) throw new Error(`Failed to log activity: ${error.message}`);
  revalidatePath(`/admin/crm/leads/${leadId}`);
  revalidatePath('/admin/crm');
}

// ── Tasks ─────────────────────────────────────────────

export async function addCrmTask(formData: FormData) {
  await assertAdmin();
  const supabase = getAdminClient();
  const leadId = requireStr(formData, 'lead_id');
  const { error } = await supabase.from('crm_tasks').insert({
    lead_id: leadId,
    title: requireStr(formData, 'title'),
    description: str(formData, 'description'),
    due_at: str(formData, 'due_at'),
    priority: oneOf(str(formData, 'priority'), CRM_PRIORITIES, 'priority') ?? 'medium',
    assigned_to: await currentUserId(),
  });
  if (error) throw new Error(`Failed to add task: ${error.message}`);
  revalidatePath(`/admin/crm/leads/${leadId}`);
  revalidatePath('/admin/crm/tasks');
}

export async function setCrmTaskStatus(formData: FormData) {
  await assertAdmin();
  const supabase = getAdminClient();
  const id = requireStr(formData, 'task_id');
  const status = oneOf(requireStr(formData, 'status'), ['open', 'completed', 'canceled'] as const, 'status');
  const { error } = await supabase
    .from('crm_tasks')
    .update({ status, completed_at: status === 'completed' ? new Date().toISOString() : null })
    .eq('id', id);
  if (error) throw new Error(`Failed to update task: ${error.message}`);
  const leadId = str(formData, 'lead_id');
  if (leadId) revalidatePath(`/admin/crm/leads/${leadId}`);
  revalidatePath('/admin/crm/tasks');
  revalidatePath('/admin/crm');
}
