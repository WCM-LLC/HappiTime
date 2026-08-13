/**
 * POST /api/intake/commit
 *
 * Writes a captured Happy Hour MENU into HappiTime's existing schema and
 * attaches it to existing AND/OR newly-created windows on the venue.
 *
 * Tables touched (all pre-existing — no schema changes):
 *   - happy_hour_windows                (only inserts new windows when new_windows[] is non-empty)
 *   - menus, menu_sections, menu_items  (the menu structure)
 *   - happy_hour_window_menus           (M:N join — multi-window comes for free)
 *
 * Body (application/json):
 *   {
 *     venue_id: string,
 *     window_ids:   string[],            // existing windows to attach the menu to (may be empty)
 *     new_windows:  [                    // brand-new windows to CREATE on the venue and attach
 *       { dow: number[], start_time: 'HH:MM', end_time: 'HH:MM', label?: string }
 *     ],
 *     menu: {
 *       name: string,                    // typically "Happy Hour"
 *       sections: [
 *         {
 *           name: string,
 *           items: [
 *             { name: string, price?: number | null, description?: string | null }
 *           ]
 *         }
 *       ]
 *     },
 *     save_as_draft:           boolean,  // relaxed validation; menu.status='draft'; no email
 *     send_owner_confirmation: boolean,  // (only valid when save_as_draft = false)
 *     owner_email?: string               // required if send_owner_confirmation is true
 *   }
 *
 * Behavior matrix:
 *   save_as_draft=true                       → menu.status='draft', no email, allows empty menu/windows
 *   send_owner_confirmation=true             → menu.status='draft', sends email; requires full payload
 *   neither (auto-publish)                   → menu.status='published'; requires full payload
 *
 * Auth: cookie session (console) or bearer token (HappiTime app). Admins get
 * the matrix above unchanged. Everyone else is checked per venue: an org
 * owner/admin publishes their own venue, while an org editor or a super user
 * is forced to draft + a review-queue entry no matter what they send.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, getServiceRoleKeyError } from '@/utils/supabase/server';
import { authenticateIntakeRequest } from '@/utils/intake-auth';
import {
  getIntakeTier,
  canUseIntakeForVenue,
  canPublishIntakeForVenue,
  resolveReviewRoute,
  notifyIntakeReviewers,
} from '@/utils/intake-access';
import {
  buildEventRows,
  normalizeContentType,
  type ContentType,
  type ProposedEvent,
} from '@/utils/intake-content';
import { isIntakeConfirmConfigured, signIntakeConfirmToken } from '@/utils/intake-token';
import { sendVenueOwnerConfirmation } from '@/utils/email';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type ItemIn = { name: string; price?: number | null; description?: string | null };
type SectionIn = { name: string; items: ItemIn[] };
type MenuIn = { name: string; sections: SectionIn[] };
type NewWindowIn = { dow: number[]; start_time: string; end_time: string; label?: string | null };

type ParsedBody = {
  venue_id: string;
  content_type: ContentType;
  events: ProposedEvent[];
  window_ids: string[];
  new_windows: NewWindowIn[];
  menu: MenuIn;
  save_as_draft: boolean;
  send_owner_confirmation: boolean;
  owner_email?: string;
};

function validateBody(body: any): { ok: true; data: ParsedBody } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!body || typeof body !== 'object') return { ok: false, errors: ['invalid_body'] };

  if (typeof body.venue_id !== 'string' || !UUID_RE.test(body.venue_id))
    errors.push('venue_id required (uuid)');

  const window_ids: string[] = Array.isArray(body.window_ids) ? body.window_ids : [];
  window_ids.forEach((id, i) => {
    if (typeof id !== 'string' || !UUID_RE.test(id))
      errors.push(`window_ids[${i}] must be a UUID`);
  });

  const new_windows: NewWindowIn[] = Array.isArray(body.new_windows) ? body.new_windows : [];
  new_windows.forEach((w, i) => {
    if (!Array.isArray(w.dow) || w.dow.length === 0)
      errors.push(`new_windows[${i}].dow missing`);
    else if (w.dow.some((d) => !Number.isInteger(d) || d < 0 || d > 6))
      errors.push(`new_windows[${i}].dow must be 0-6`);
    if (typeof w.start_time !== 'string' || !TIME_RE.test(w.start_time))
      errors.push(`new_windows[${i}].start_time invalid`);
    if (typeof w.end_time !== 'string' || !TIME_RE.test(w.end_time))
      errors.push(`new_windows[${i}].end_time invalid`);
  });

  // The type a HUMAN confirmed in the review step. Defaults to happy_hour so
  // an older client that predates classification keeps working unchanged.
  const content_type = normalizeContentType(body.content_type ?? 'happy_hour');
  if (content_type === 'unknown') errors.push('content_type must be confirmed before commit');
  const events: ProposedEvent[] = Array.isArray(body.events) ? body.events : [];
  const wantsEvents = content_type === 'event' || content_type === 'event_series' || content_type === 'mixed';
  if (wantsEvents && events.length === 0)
    errors.push('events required when content_type is an event type');
  if (!wantsEvents && events.length > 0)
    errors.push('events sent but content_type is not an event type');

  const save_as_draft = Boolean(body.save_as_draft);
  const send = Boolean(body.send_owner_confirmation);
  if (save_as_draft && send)
    errors.push('save_as_draft and send_owner_confirmation are mutually exclusive');

  // An events-only scan carries no windows and no menu sections. Those
  // requirements exist for happy hours, so they must key off the confirmed
  // content type — not off save_as_draft, which is coerced later in the route
  // and so is still `false` here. Keying on it rejected every events-only
  // commit with "menu.sections must have at least one section".
  const carriesMenu = content_type === 'happy_hour' || content_type === 'mixed';
  const menuRequired = carriesMenu && !save_as_draft;

  const menu = body.menu;
  if (!menu || typeof menu !== 'object') {
    // In draft mode we accept an empty/missing menu so the operator can save
    // partial progress (e.g. windows captured, menu still to extract).
    if (menuRequired) errors.push('menu required');
  } else {
    if (typeof menu.name !== 'string' || !menu.name.trim()) errors.push('menu.name required');
    const sections: any[] = Array.isArray(menu.sections) ? menu.sections : [];
    if (menuRequired && sections.length === 0)
      errors.push('menu.sections must have at least one section (or use save_as_draft)');
    sections.forEach((s, si) => {
      if (typeof s?.name !== 'string' || !s.name.trim())
        errors.push(`menu.sections[${si}].name required`);
      const items: any[] = Array.isArray(s?.items) ? s.items : [];
      if (menuRequired && items.length === 0)
        errors.push(`menu.sections[${si}].items must have at least one item (or use save_as_draft)`);
      items.forEach((it, ii) => {
        if (typeof it?.name !== 'string' || !it.name.trim())
          errors.push(`menu.sections[${si}].items[${ii}].name required`);
        if (
          it?.price != null &&
          (typeof it.price !== 'number' || !Number.isFinite(it.price) || it.price < 0)
        )
          errors.push(`menu.sections[${si}].items[${ii}].price must be a non-negative number or null`);
      });
    });
  }

  // In strict (non-draft) mode, you must attach at least one window — either
  // existing or newly created.
  if (menuRequired && window_ids.length === 0 && new_windows.length === 0)
    errors.push('attach at least one window (existing or new), or use save_as_draft');

  // The owner-confirmation link resolves to a menu, so it only makes sense for
  // a scan that carries one.
  if (send && !carriesMenu)
    errors.push('send_owner_confirmation only applies to a happy-hour menu');

  const ownerEmail = typeof body.owner_email === 'string' ? body.owner_email.trim() : undefined;
  if (send && !ownerEmail) errors.push('owner_email required when send_owner_confirmation is true');

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    data: {
      venue_id: body.venue_id,
      content_type,
      events,
      window_ids,
      new_windows,
      menu: menu ?? { name: 'Happy Hour', sections: [] },
      save_as_draft,
      send_owner_confirmation: send,
      owner_email: ownerEmail,
    },
  };
}

export async function POST(req: NextRequest) {
  const caller = await authenticateIntakeRequest(req);
  if (!caller) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { supabase, user } = caller;
  const tier = await getIntakeTier(supabase, user);
  if (!tier) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const v = validateBody(json);
  if (!v.ok) return NextResponse.json({ error: 'invalid_payload', errors: v.errors }, { status: 400 });
  let {
    save_as_draft,
    send_owner_confirmation,
  } = v.data;
  const {
    venue_id,
    content_type,
    events,
    window_ids,
    new_windows,
    menu,
    owner_email,
  } = v.data;
  const wantsEvents =
    content_type === 'event' || content_type === 'event_series' || content_type === 'mixed';
  const carriesMenu = content_type === 'happy_hour' || content_type === 'mixed';

  // Venue scope is re-checked server-side for every non-admin tier — never
  // trust the picker.
  if (tier !== 'admin') {
    if (!(await canUseIntakeForVenue(supabase, user, tier, venue_id))) {
      return NextResponse.json({ error: 'forbidden_venue' }, { status: 403 });
    }
    // Confirmation emails ask a venue's owner to vouch for someone else's
    // edit — meaningless when the submitter is the owner, and the wrong
    // channel for a super user (they go through review instead).
    send_owner_confirmation = false;
  }

  // Who may publish without review is a per-venue question, not a per-tier
  // one: an org owner/admin publishes their own venue, but an editor of that
  // same org does not, and a super user never does. Anyone who can't publish
  // is forced to a draft HERE, not in the UI, so a hand-crafted autoPublish
  // request cannot bypass review.
  const canPublish =
    tier === 'admin' || (await canPublishIntakeForVenue(supabase, user, tier, venue_id));
  if (!canPublish) {
    save_as_draft = true;
  }

  if (send_owner_confirmation && !isIntakeConfirmConfigured()) {
    return NextResponse.json(
      { error: 'confirmation_not_configured', detail: 'Set INTAKE_CONFIRM_SECRET to enable owner confirmation links.' },
      { status: 503 },
    );
  }
  if (getServiceRoleKeyError()) {
    return NextResponse.json({ error: 'service_role_missing' }, { status: 503 });
  }
  const db = createServiceClient();

  // 1. Look up venue + its org_id (menus.org_id is NOT NULL).
  const { data: venue, error: venueErr } = (await db
    .from('venues')
    .select('id, name, org_id, timezone')
    .eq('id', venue_id)
    .single()) as any;
  if (venueErr || !venue) return NextResponse.json({ error: 'venue_not_found' }, { status: 404 });

  // 2. Verify every window_id belongs to this venue.
  let foundWindows: Array<{ id: string; dow: number[]; start_time: string; end_time: string; label: string | null }> = [];
  if (window_ids.length > 0) {
    const { data, error: winVerifyErr } = (await db
      .from('happy_hour_windows')
      .select('id, dow, start_time, end_time, label')
      .eq('venue_id', venue_id)
      .in('id', window_ids)) as any;
    if (winVerifyErr) {
      console.error('[intake/commit] window_verify_failed:', winVerifyErr);
      return NextResponse.json(
        { error: 'window_verify_failed', detail: winVerifyErr.message, code: winVerifyErr.code },
        { status: 500 },
      );
    }
    foundWindows = (data ?? []) as any[];
    const verifiedIds = new Set(foundWindows.map((r) => r.id));
    const missing = window_ids.filter((id) => !verifiedIds.has(id));
    if (missing.length > 0) {
      return NextResponse.json({ error: 'windows_not_found', missing_ids: missing }, { status: 404 });
    }
  }

  // 2b. Insert any brand-new windows the operator added in this session.
  // These are created at the same publish status as the menu (draft if we're
  // drafting, published if auto-publishing).
  const targetWindowStatus = save_as_draft || send_owner_confirmation ? 'draft' : 'published';
  const newlyInsertedWindowIds: string[] = [];
  if (new_windows.length > 0) {
    const newWindowRows = new_windows.map((w) => ({
      venue_id,
      dow: w.dow,
      start_time: w.start_time,
      end_time: w.end_time,
      label: w.label ?? null,
      status: targetWindowStatus,
      last_confirmed_at: save_as_draft || send_owner_confirmation ? null : new Date().toISOString(),
    }));
    const { data: insertedRows, error: newWinErr } = (await db
      .from('happy_hour_windows')
      .insert(newWindowRows)
      .select('id')) as any;
    if (newWinErr) {
      console.error('[intake/commit] new_window_insert_failed:', newWinErr);
      return NextResponse.json(
        { error: 'new_window_insert_failed', detail: newWinErr.message, code: newWinErr.code },
        { status: 500 },
      );
    }
    for (const r of insertedRows as Array<{ id: string }>) newlyInsertedWindowIds.push(r.id);
  }

  // Combined list of all window ids we'll attach the menu to.
  const allWindowIds = [...window_ids, ...newlyInsertedWindowIds];

  const menuStatus = save_as_draft || send_owner_confirmation ? 'draft' : 'published';

  // 3. Insert the menu row — but only when this scan actually carries a menu.
  // An events-only scan would otherwise leave an empty "Happy Hour" menu on
  // the venue, which approveSubmission would then dutifully publish.
  let menu_id: string | null = null;
  if (carriesMenu) {
    const { data: insertedMenu, error: menuErr } = (await db
      .from('menus')
      .insert({
        org_id: venue.org_id,
        venue_id,
        name: menu.name || 'Happy Hour',
        status: menuStatus,
        is_active: true,
        // scope defaults to 'venue' in the schema; we don't override it here.
      })
      .select('id')
      .single()) as any;
    if (menuErr || !insertedMenu) {
      console.error('[intake/commit] menu_insert_failed:', menuErr);
      return NextResponse.json(
        { error: 'menu_insert_failed', detail: menuErr?.message, code: menuErr?.code },
        { status: 500 },
      );
    }
    menu_id = insertedMenu.id as string;
  }

  // Helper: rolls back everything we inserted this request — including any
  // brand-new windows. ON DELETE CASCADE on menu_sections + menu_items means
  // deleting the menu also drops its sections/items.
  async function rollbackAll(reason: string) {
    const { error: delJoinsErr } = await db
      .from('happy_hour_window_menus')
      .delete()
      .eq('menu_id', menu_id);
    const { error: delMenuErr } = await db.from('menus').delete().eq('id', menu_id);
    let delNewWindowsErr: { message: string } | null = null;
    if (newlyInsertedWindowIds.length > 0) {
      const { error } = await db
        .from('happy_hour_windows')
        .delete()
        .in('id', newlyInsertedWindowIds);
      delNewWindowsErr = error as { message: string } | null;
    }
    console.error(`[intake/commit] rollback (${reason}):`, {
      del_joins_error: delJoinsErr?.message ?? null,
      del_menu_error: delMenuErr?.message ?? null,
      del_new_windows_error: delNewWindowsErr?.message ?? null,
      menu_id,
      rolled_back_window_ids: newlyInsertedWindowIds,
    });
  }

  // 4. Insert sections (if any). Save-as-draft allows zero sections.
  let sectionIds: string[] = [];
  if (menu.sections.length > 0) {
    const sectionRows = menu.sections.map((s, idx) => ({
      menu_id,
      name: s.name,
      sort_order: idx,
    }));
    const { data: insertedSections, error: secErr } = (await db
      .from('menu_sections')
      .insert(sectionRows)
      .select('id')) as any;
    if (secErr || !insertedSections) {
      await rollbackAll('section_insert_failed');
      return NextResponse.json(
        { error: 'section_insert_failed', detail: secErr?.message, code: secErr?.code },
        { status: 500 },
      );
    }
    sectionIds = (insertedSections as Array<{ id: string }>).map((r) => r.id);
  }

  // 5. Insert items, flattened across sections.
  const itemRows = menu.sections.flatMap((s, si) =>
    s.items.map((it, ii) => ({
      section_id: sectionIds[si],
      name: it.name,
      description: it.description ?? null,
      price: it.price ?? null,
      is_happy_hour: true,
      sort_order: ii,
    })),
  );
  if (itemRows.length > 0) {
    const { error: itemErr } = await db.from('menu_items').insert(itemRows);
    if (itemErr) {
      await rollbackAll('item_insert_failed');
      return NextResponse.json(
        { error: 'item_insert_failed', detail: itemErr.message, code: itemErr.code },
        { status: 500 },
      );
    }
  }

  // 6. Attach the menu to every selected window via the existing M:N join.
  // Allowed to be empty when saving as draft.
  const joinRows = allWindowIds.map((wid) => ({
    happy_hour_window_id: wid,
    menu_id,
  }));
  const { error: joinErr } = joinRows.length > 0
    ? await db.from('happy_hour_window_menus').insert(joinRows)
    : { error: null };
  if (joinErr) {
    await rollbackAll('window_menus_insert_failed');
    return NextResponse.json(
      { error: 'window_menus_insert_failed', detail: joinErr.message, code: joinErr.code },
      { status: 500 },
    );
  }

  // Events, when that is what the person confirmed they photographed. These
  // are written AFTER the menu work so a failure here cannot leave a
  // half-written menu behind; the menu path has already committed or rolled
  // back by this point.
  const eventIds: string[] = [];
  let unschedulableEvents: string[] = [];
  if (wantsEvents) {
    const { rows: eventRows, unschedulable } = buildEventRows(events, {
      venueId: venue_id,
      timezone: (venue?.timezone as string | null) ?? 'America/Chicago',
      // Same publish-or-queue rule as the menu: only someone who can publish
      // this venue gets live events.
      status: save_as_draft ? 'draft' : 'published',
      createdBy: user.id,
    });

    if (eventRows.length > 0) {
      const { data: insertedEvents, error: eventErr } = (await db
        .from('venue_events')
        .insert(eventRows)
        .select('id')) as any;
      if (eventErr) {
        console.error('[intake/commit] event_insert_failed:', eventErr);
        return NextResponse.json(
          { error: 'event_insert_failed', detail: eventErr.message, code: eventErr.code },
          { status: 500 },
        );
      }
      for (const r of (insertedEvents ?? []) as Array<{ id: string }>) eventIds.push(r.id);
    }
    // Reported, never swallowed: an event the model could not place on a
    // calendar has to come back to a human rather than vanish.
    unschedulableEvents = unschedulable;
  }

  // Done writing. Three exit paths depending on mode:
  //   save_as_draft           → done; menu lives in draft for later editing.
  //   auto-publish            → done; menu is live.
  //   send_owner_confirmation → sign token + email; menu lives in draft.
  if (save_as_draft) {
    // A draft from someone who can't publish enters a review queue — the
    // venue's own org when it has someone who can act, otherwise HappiTime
    // staff. A draft saved by someone who COULD have published is just a
    // draft: nobody else has to bless it.
    let submissionId: string | null = null;
    let reviewRoute: 'owner' | 'admin' | null = null;
    if (!canPublish) {
      const routed = await resolveReviewRoute(venue_id);
      reviewRoute = routed.route;
      const { data: submission, error: subErr } = (await db
        .from('intake_submissions')
        .insert({
          venue_id,
          menu_id,
          submitted_by: user.id,
          tier,
          content_type,
          review_route: routed.route,
          review_org_id: routed.orgId,
        })
        .select('id')
        .single()) as any;
      if (subErr) {
        console.error('[intake/commit] submission_insert_failed:', subErr);
      } else {
        submissionId = submission?.id ?? null;
        // Link the drafted events so the queue can say "3 events" and the
        // approve action knows what to publish.
        if (submissionId && eventIds.length > 0) {
          const { error: linkErr } = await db
            .from('intake_submission_events')
            .insert(eventIds.map((id) => ({ submission_id: submissionId, event_id: id })));
          if (linkErr) console.error('[intake/commit] event_link_failed:', linkErr);
        }
        await notifyIntakeReviewers({
          route: routed.route,
          orgId: routed.orgId,
          venueName: venue?.name ?? 'a venue',
        });
      }
    }
    return NextResponse.json({
      ok: true,
      drafted: true,
      in_review: !canPublish,
      review_route: reviewRoute,
      submission_id: submissionId,
      content_type,
      event_ids: eventIds,
      unschedulable_events: unschedulableEvents,
      venue_id,
      menu_id,
      window_ids: allWindowIds,
      new_window_ids: newlyInsertedWindowIds,
    });
  }

  if (!send_owner_confirmation) {
    return NextResponse.json({
      ok: true,
      published: true,
      content_type,
      event_ids: eventIds,
      unschedulable_events: unschedulableEvents,
      venue_id,
      menu_id,
      window_ids: allWindowIds,
      new_window_ids: newlyInsertedWindowIds,
    });
  }

  // Sign a confirmation token and email the owner. validateBody already
  // rejects this combination without a menu; this guard keeps the invariant
  // local rather than trusting a check 400 lines away.
  if (!menu_id) {
    return NextResponse.json(
      { error: 'confirmation_requires_menu' },
      { status: 400 },
    );
  }
  const token = signIntakeConfirmToken({ venue_id, menu_id, window_ids: allWindowIds });
  const origin =
    process.env.NEXT_PUBLIC_CONSOLE_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    new URL(req.url).origin;
  const claimUrl = `${origin.replace(/\/$/, '')}/claim/${encodeURIComponent(token)}`;

  // Build the human-readable window summary from BOTH the verified-existing
  // rows and the new-windows we just inserted.
  const newWinSummaries = new_windows.map((w) => ({
    dow: w.dow,
    start_time: w.start_time,
    end_time: w.end_time,
  }));
  const windowSummary = [...foundWindows, ...newWinSummaries]
    .map((w) => {
      const days = [...w.dow].sort((a, b) => a - b).map((d) => DOW_NAMES[d]).join('/');
      return `${days} ${w.start_time.slice(0, 5)}–${w.end_time.slice(0, 5)}`;
    })
    .join(', ');
  const totalItems = menu.sections.reduce((sum, s) => sum + s.items.length, 0);

  const sendResult = await sendVenueOwnerConfirmation({
    to: owner_email!,
    venueName: venue.name as string,
    claimUrl,
    windowSummary,
    itemCount: totalItems,
  });

  return NextResponse.json({
    ok: true,
    published: false,
    venue_id,
    menu_id,
    window_ids: allWindowIds,
    new_window_ids: newlyInsertedWindowIds,
    claim_url: claimUrl,
    email: sendResult,
  });
}
