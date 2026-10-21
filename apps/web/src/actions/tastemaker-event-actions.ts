'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient, createServiceClient } from '@/utils/supabase/server';
import { isAdminEmail } from '@/utils/admin-emails';
import { EVENTS_PATH, loginPathFor } from '@/utils/auth-paths';
import { buildEventRows } from '@/utils/intake-content';
import { notifyIntakeReviewers, resolveReviewRoute } from '@/utils/intake-access';
import { parseTastemakerEventForm } from '@/utils/tastemakerEvent.mjs';

/**
 * A Tastemaker proposes an event by hand. No photo, no vision model — but the
 * row it produces is indistinguishable from a scanned flyer's: a draft
 * venue_events row plus an intake_submissions entry routed to whoever can act
 * on it (the venue's org when it has an approver, else HappiTime staff).
 * Approval of an events-only submission publishes (utils/intake-review.ts).
 *
 * An admin using the same form skips the queue: their event publishes at
 * once, the way an admin's intake commit does.
 */
export async function submitTastemakerEvent(formData: FormData) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect(loginPathFor(EVENTS_PATH));

  const adminOk = await isAdminEmail(auth.user.email);
  let isSuperUser = false;
  if (!adminOk) {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('user_id', auth.user.id)
      .maybeSingle();
    isSuperUser = (profile as { role?: string | null } | null)?.role === 'super_user';
    if (!isSuperUser) redirect(loginPathFor(EVENTS_PATH, 'not_authorized'));
  }

  const db = createServiceClient();

  // Validate before touching the venue so a bad form never costs a query.
  const str = (k: string) => String(formData.get(k) ?? '');
  const venueIdRaw = str('venue_id');
  const { data: venueRow } = venueIdRaw
    ? ((await db
        .from('venues')
        .select('id, name, status, timezone')
        .eq('id', venueIdRaw)
        .maybeSingle()) as { data: { id: string; name: string; status: string; timezone: string | null } | null })
    : { data: null };
  const timezone = venueRow?.timezone ?? 'America/Chicago';

  const parsed = parseTastemakerEventForm(
    {
      venue_id: venueIdRaw,
      title: str('title'),
      description: str('description'),
      event_type: str('event_type'),
      date: str('date'),
      start_time: str('start_time'),
      end_time: str('end_time'),
      is_recurring: str('is_recurring'),
      dow: formData.getAll('dow').map(String),
      price_info: str('price_info'),
      external_url: str('external_url'),
    },
    { now: new Date(), timezone },
  );

  if (!parsed.ok) redirect(`${EVENTS_PATH}/new?error=${encodeURIComponent(parsed.errors[0])}`);
  // Same rule as a super user's intake scan: any published venue, nothing else.
  if (!venueRow || venueRow.status !== 'published') redirect(`${EVENTS_PATH}/new?error=venue_not_published`);

  const publishNow = adminOk;
  const publishedAt = publishNow ? new Date().toISOString() : null;
  const { rows, unschedulable } = buildEventRows([parsed.proposed], {
    venueId: venueRow.id,
    timezone,
    status: publishNow ? 'published' : 'draft',
    createdBy: auth.user.id,
    createdByTier: adminOk ? 'admin' : 'super_user',
    publishedAt,
  });
  if (rows.length === 0 || unschedulable.length > 0) {
    redirect(`${EVENTS_PATH}/new?error=unschedulable`);
  }
  if (parsed.externalUrl) rows[0].external_url = parsed.externalUrl;

  const { data: inserted, error: insertErr } = (await db
    .from('venue_events')
    .insert(rows[0])
    .select('id')
    .single()) as { data: { id: string } | null; error: { message: string } | null };
  if (insertErr || !inserted) {
    console.error('[tastemaker-event] insert failed:', insertErr);
    redirect(`${EVENTS_PATH}/new?error=save_failed`);
  }

  if (!publishNow) {
    const routed = await resolveReviewRoute(venueRow.id);
    const { data: submission, error: subErr } = (await db
      .from('intake_submissions')
      .insert({
        venue_id: venueRow.id,
        menu_id: null,
        submitted_by: auth.user.id,
        tier: 'super_user',
        content_type: parsed.contentType,
        review_route: routed.route,
        review_org_id: routed.orgId,
      })
      .select('id')
      .single()) as { data: { id: string } | null; error: { message: string } | null };

    if (subErr || !submission) {
      // Without a submission the draft is orphaned: nobody would ever see it.
      // Remove it and tell the author rather than leave a silent dead row.
      console.error('[tastemaker-event] submission insert failed:', subErr);
      await db.from('venue_events').delete().eq('id', inserted.id);
      redirect(`${EVENTS_PATH}/new?error=save_failed`);
    }

    const { error: linkErr } = await db
      .from('intake_submission_events')
      .insert({ submission_id: submission.id, event_id: inserted.id });
    if (linkErr) console.error('[tastemaker-event] event link failed:', linkErr);

    await notifyIntakeReviewers({
      route: routed.route,
      orgId: routed.orgId,
      venueName: venueRow.name,
    });
  }

  revalidatePath(EVENTS_PATH);
  redirect(`${EVENTS_PATH}?notice=${publishNow ? 'published' : 'submitted'}`);
}
