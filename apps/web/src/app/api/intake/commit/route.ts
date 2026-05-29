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
 * Auth: admin-only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient, getServiceRoleKeyError } from '@/utils/supabase/server';
import { isAdminEmail } from '@/utils/admin-emails';
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

  const save_as_draft = Boolean(body.save_as_draft);
  const send = Boolean(body.send_owner_confirmation);
  if (save_as_draft && send)
    errors.push('save_as_draft and send_owner_confirmation are mutually exclusive');

  const menu = body.menu;
  if (!menu || typeof menu !== 'object') {
    // In draft mode we accept an empty/missing menu so the operator can save
    // partial progress (e.g. windows captured, menu still to extract).
    if (!save_as_draft) errors.push('menu required');
  } else {
    if (typeof menu.name !== 'string' || !menu.name.trim()) errors.push('menu.name required');
    const sections: any[] = Array.isArray(menu.sections) ? menu.sections : [];
    if (!save_as_draft && sections.length === 0)
      errors.push('menu.sections must have at least one section (or use save_as_draft)');
    sections.forEach((s, si) => {
      if (typeof s?.name !== 'string' || !s.name.trim())
        errors.push(`menu.sections[${si}].name required`);
      const items: any[] = Array.isArray(s?.items) ? s.items : [];
      if (!save_as_draft && items.length === 0)
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
  if (!save_as_draft && window_ids.length === 0 && new_windows.length === 0)
    errors.push('attach at least one window (existing or new), or use save_as_draft');

  const ownerEmail = typeof body.owner_email === 'string' ? body.owner_email.trim() : undefined;
  if (send && !ownerEmail) errors.push('owner_email required when send_owner_confirmation is true');

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    data: {
      venue_id: body.venue_id,
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await isAdminEmail(user.email))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const v = validateBody(json);
  if (!v.ok) return NextResponse.json({ error: 'invalid_payload', errors: v.errors }, { status: 400 });
  const {
    venue_id,
    window_ids,
    new_windows,
    menu,
    save_as_draft,
    send_owner_confirmation,
    owner_email,
  } = v.data;

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
    .select('id, name, org_id')
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

  // 3. Insert the menu row.
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
  const menu_id: string = insertedMenu.id;

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

  // Done writing. Three exit paths depending on mode:
  //   save_as_draft           → done; menu lives in draft for later editing.
  //   auto-publish            → done; menu is live.
  //   send_owner_confirmation → sign token + email; menu lives in draft.
  if (save_as_draft) {
    return NextResponse.json({
      ok: true,
      drafted: true,
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
      venue_id,
      menu_id,
      window_ids: allWindowIds,
      new_window_ids: newlyInsertedWindowIds,
    });
  }

  // Sign a confirmation token and email the owner.
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
