import Link from 'next/link';
import UserBar from '@/components/layout/UserBar';
import VenueMediaUploader from '@/components/VenueMediaUploader';
import { createClient, createServiceClient } from '@/utils/supabase/server';
import { fetchVenueById, type VenueDetail } from '@happitime/shared-api';
import {
  updateVenue,
  addHappyHour,
  updateHappyHour,
  deleteHappyHour,
  publishHappyHour,
  unpublishHappyHour,
  updateHappyHourMenus,
  createMenu,
  updateMenu,
  deleteMenu,
  publishMenu,
  unpublishMenu,
  createSection,
  updateSection,
  deleteSection,
  createItem,
  updateItem,
  deleteItem,
} from '../../../../../actions/venue-actions';
import {
  createEvent,
  updateEvent,
  deleteEvent,
  publishEvent,
  unpublishEvent,
  updateVenueTags,
} from '../../../../../actions/event-actions';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const HH_STATUS_PUBLISHED = 'published';

type Venue = VenueDetail;

type HappyHourWindow = {
  id: string;
  dow: number[];
  start_time: string;
  end_time: string;
  timezone: string;
  status: string;
  label: string | null;
};

type HappyHourWindowMenu = {
  happy_hour_window_id: string;
  menu_id: string;
};

type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  is_happy_hour?: boolean;
  sort_order: number;
};

type MenuSection = {
  id: string;
  name: string;
  sort_order: number;
  menu_items: MenuItem[] | null;
};

type Menu = {
  id: string;
  name: string;
  status?: string;
  is_active: boolean;
  menu_sections: MenuSection[] | null;
};

type EventCount = {
  event_type: string;
  cnt: number;
};

type VenueEventRow = {
  id: string;
  title: string;
  description: string | null;
  event_type: string;
  status: string;
  starts_at: string;
  ends_at: string | null;
  is_recurring: boolean;
  recurrence_rule: string | null;
  timezone: string;
  price_info: string | null;
  external_url: string | null;
  ticket_url: string | null;
  capacity: number | null;
  location_override: string | null;
};

type ApprovedTagRow = {
  id: string;
  slug: string;
  label: string;
  category: string;
  sort_order: number;
};

type VenueTagRow = {
  tag_id: string;
};

function timeForInput(t: string) {
  if (!t) return '';
  return t.length >= 5 ? t.slice(0, 5) : t;
}

/** Parse an iCalendar RRULE BYDAY list back to numeric DOW indices (0=Sun..6=Sat) */
function parseRruleDow(rule: string | null): number[] {
  if (!rule) return [];
  const match = rule.match(/BYDAY=([A-Z,]+)/);
  if (!match) return [];
  const dayMap: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
  return match[1].split(',').map((d) => dayMap[d]).filter((n) => n !== undefined);
}

/** Human-readable summary of a recurrence rule */
function formatRecurrence(rule: string | null): string {
  if (!rule) return 'Recurring';
  const days = parseRruleDow(rule);
  if (days.length === 0) return 'Recurring';
  const labels = days.map((d) => DOW[d]);
  return `Every ${labels.join(', ')}`;
}

function formatDays(days: number[]) {
  const labels = (days ?? []).map((d) => DOW[d] ?? String(d));
  return labels.length ? labels.join(', ') : '—';
}

interface Coordinates {
  lat: number;
  lon: number;
}

function distanceMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (x: number): number => (x * Math.PI) / 180;
  const R = 3958.8;

  return (
    R *
    Math.acos(
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.cos(toRad(lon2) - toRad(lon1)) +
        Math.sin(toRad(lat1)) * Math.sin(toRad(lat2))
    )
  );
}

function isAdminEmail(email: string | undefined): boolean {
  if (!email) return false;
  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  return adminEmails.length > 0 && adminEmails.includes(email.toLowerCase());
}

export default async function VenuePage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string; venueId: string }>;
  searchParams: Promise<{ error?: string; from?: string }>;
}) {
  const { orgId, venueId } = await params;
  const sp = await searchParams;
  const pageError = sp?.error;
  const fromAdmin = sp?.from === 'admin';

  const authClient = await createClient();
  const { data: auth } = await authClient.auth.getUser();
  const user = auth.user;

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted">Not authenticated.</p>
      </div>
    );
  }

  const userIsAdmin = isAdminEmail(user.email);
  const supabase = (fromAdmin && userIsAdmin) ? createServiceClient() : await createClient();

  const { data: membership } = await (await createClient())
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle();

  const role = String(membership?.role ?? '');
  const isOwner = role === 'owner' || (fromAdmin && userIsAdmin);
  const isManager = role === 'manager' || role === 'admin' || role === 'editor';
  const isHost = role === 'host';
  const canManageVenue = isOwner || isManager || (fromAdmin && userIsAdmin);
  const canEditMenuItems = canManageVenue || isHost;

  const { data: venue, error: venueErr } = await fetchVenueById(supabase as any, venueId, { orgId });

  const { data: happyHours, error: hhErr } = await supabase
    .from('happy_hour_windows')
    .select('id,dow,start_time,end_time,timezone,status,label')
    .eq('venue_id', venueId)
    .order('start_time', { ascending: true });

  const { data: menus, error: menusErr } = await supabase
    .from('menus')
    .select(
      'id,name,status,is_active,menu_sections(id,name,sort_order,menu_items(id,name,description,price,is_happy_hour,sort_order))'
    )
    .eq('venue_id', venueId)
    .order('created_at', { ascending: false });

  const happyHourIds = (happyHours as HappyHourWindow[] | null)?.map((h) => h.id) ?? [];
  let windowMenus: HappyHourWindowMenu[] = [];
  let windowMenusErr: { message: string } | null = null;

  if (happyHourIds.length) {
    const { data: hhMenus, error: hhMenusErr } = await supabase
      .from('happy_hour_window_menus')
      .select('happy_hour_window_id,menu_id')
      .in('happy_hour_window_id', happyHourIds);

    windowMenus = (hhMenus as HappyHourWindowMenu[] | null) ?? [];
    windowMenusErr = hhMenusErr;
  }

  const { data: eventCounts } = await supabase
    .from('venue_event_counts')
    .select('event_type,cnt')
    .eq('org_id', orgId)
    .eq('venue_id', venueId)
    .order('cnt', { ascending: false })
    .limit(20);

  // Venue events
  const { data: venueEvents } = await supabase
    .from('venue_events')
    .select('id,title,description,event_type,status,starts_at,ends_at,is_recurring,recurrence_rule,timezone,price_info,external_url,ticket_url,capacity,location_override')
    .eq('venue_id', venueId)
    .order('starts_at', { ascending: true });

  // Approved tags
  const { data: approvedTags } = await supabase
    .from('approved_tags')
    .select('id,slug,label,category,sort_order')
    .eq('is_active', true)
    .order('category')
    .order('sort_order');

  // Current venue tags
  const { data: currentVenueTags } = await supabase
    .from('venue_tags')
    .select('tag_id')
    .eq('venue_id', venueId);


  const v = venue;
  const menuList = (menus as Menu[] | null) ?? [];
  const menuSelections = new Map<string, Set<string>>();

  for (const link of windowMenus) {
    if (!menuSelections.has(link.happy_hour_window_id)) {
      menuSelections.set(link.happy_hour_window_id, new Set());
    }
    menuSelections.get(link.happy_hour_window_id)?.add(link.menu_id);
  }
  const previewHref = `/app-preview/orgs/${orgId}/venues/${venueId}`;
  const displayName = v?.org_name?.trim() || v?.name || 'Venue';
  const locationLabel = v?.org_name?.trim() && v.org_name !== v?.name ? v.name : null;
  const backHref = fromAdmin ? `/orgs/${orgId}?from=admin` : `/orgs/${orgId}`;

  /* ── Shared input class ── */
  const inputCls =
    'flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-body-sm text-foreground placeholder:text-muted-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand transition-colors';
  const selectCls =
    'flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-body-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand transition-colors appearance-none';
  const btnPrimary =
    'inline-flex items-center justify-center h-10 px-5 rounded-md bg-brand text-white text-body-sm font-medium hover:bg-brand-dark transition-colors cursor-pointer';
  const btnSecondary =
    'inline-flex items-center justify-center h-9 px-4 rounded-md border border-border bg-surface text-body-sm font-medium text-foreground hover:bg-background transition-colors cursor-pointer';
  const btnDanger =
    'inline-flex items-center justify-center h-9 px-3 rounded-md text-body-sm font-medium text-error hover:bg-error-light border border-border transition-colors cursor-pointer';
  const btnDark =
    'inline-flex items-center justify-center h-9 px-4 rounded-md bg-dark text-dark-foreground text-body-sm font-medium hover:bg-dark/90 transition-colors cursor-pointer';

  return (
    <div className="min-h-screen bg-background">
      <UserBar />

      <main className="max-w-[var(--width-content)] mx-auto px-6 py-8">
        {/* ── Page Header ── */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href={fromAdmin ? '/admin' : '/dashboard'} className="text-body-sm text-muted hover:text-foreground transition-colors">
                {fromAdmin ? 'Admin' : 'Dashboard'}
              </Link>
              <span className="text-muted-light">/</span>
              <Link href={backHref} className="text-body-sm text-muted hover:text-foreground transition-colors">
                Organization
              </Link>
              <span className="text-muted-light">/</span>
            </div>
            <h1 className="text-display-md font-bold text-foreground tracking-tight">{displayName}</h1>
            <p className="text-body-sm text-muted mt-1">
              {locationLabel ? `${locationLabel} · ` : ''}
              {v?.city || v?.state ? `${v?.city ?? ''}${v?.city && v?.state ? ', ' : ''}${v?.state ?? ''}` : '—'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href={previewHref} target="_blank" rel="noopener noreferrer">
              <span className={btnDark}>Preview in App</span>
            </Link>
            {fromAdmin ? (
              <Link href="/admin">
                <span className={btnSecondary}>Return to console</span>
              </Link>
            ) : null}
            <Link href={backHref}>
              <span className={btnSecondary}>&larr; Back</span>
            </Link>
          </div>
        </div>

        {/* ── Error Banners ── */}
        {[
          pageError && { title: 'Error', msg: pageError },
          venueErr && { title: 'Venue load error', msg: venueErr.message },
          hhErr && { title: 'Happy hour load error', msg: hhErr.message },
          menusErr && { title: 'Menus load error', msg: menusErr.message },
          windowMenusErr && { title: 'Menu mapping error', msg: windowMenusErr.message },
        ]
          .filter(Boolean)
          .map((e, i) => (
            <div key={i} className="rounded-md border border-error bg-error-light px-4 py-3 mb-4">
              <p className="text-body-sm font-medium text-error">{(e as { title: string }).title}</p>
              <p className="text-body-sm text-error/80 mt-0.5">{(e as { msg: string }).msg}</p>
            </div>
          ))}

        {/* ══════════════════════════════════════════════
            SECTION 1 — VENUE INFO
        ══════════════════════════════════════════════ */}
        <div className="rounded-lg border border-border bg-surface p-6 shadow-sm mb-8">
          <div className="mb-5">
            <h2 className="text-heading-sm font-semibold text-foreground">Venue info</h2>
            <p className="text-body-sm text-muted mt-0.5">Core location details and display preferences.</p>
          </div>

          <form className="flex flex-col gap-4">
            <div>
              <label htmlFor="vi-name" className="text-body-sm font-medium text-foreground block mb-1.5">
                Name
              </label>
              <input id="vi-name" name="name" defaultValue={v?.name ?? ''} required readOnly={!canManageVenue} className={inputCls} />
            </div>

            <div>
              <label htmlFor="vi-app-pref" className="text-body-sm font-medium text-foreground block mb-1.5">
                App display name
              </label>
              <select id="vi-app-pref" name="app_name_preference" defaultValue={v?.app_name_preference ?? 'org'} disabled={!canManageVenue} className={selectCls}>
                <option value="org">Organization name (default)</option>
                <option value="venue">Venue / location name</option>
              </select>
              <p className="text-caption text-muted mt-1.5">
                Controls the name shown in the consumer app.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="vi-addr" className="text-body-sm font-medium text-foreground block mb-1.5">Street address</label>
                <input id="vi-addr" name="address" placeholder="123 Main St" defaultValue={v?.address ?? ''} readOnly={!canManageVenue} className={inputCls} />
              </div>
              <div>
                <label htmlFor="vi-city" className="text-body-sm font-medium text-foreground block mb-1.5">City</label>
                <input id="vi-city" name="city" placeholder="Austin" defaultValue={v?.city ?? ''} readOnly={!canManageVenue} className={inputCls} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="vi-state" className="text-body-sm font-medium text-foreground block mb-1.5">State</label>
                <input id="vi-state" name="state" placeholder="TX" defaultValue={v?.state ?? ''} readOnly={!canManageVenue} className={inputCls} />
              </div>
              <div>
                <label htmlFor="vi-zip" className="text-body-sm font-medium text-foreground block mb-1.5">ZIP</label>
                <input id="vi-zip" name="zip" placeholder="78701" defaultValue={v?.zip ?? ''} readOnly={!canManageVenue} className={inputCls} />
              </div>
              <div>
                <label htmlFor="vi-tz" className="text-body-sm font-medium text-foreground block mb-1.5">Timezone</label>
                <input id="vi-tz" name="timezone" defaultValue={v?.timezone ?? 'America/Chicago'} readOnly={!canManageVenue} className={inputCls} />
              </div>
            </div>

            {canManageVenue ? (
              <div>
                <button formAction={updateVenue.bind(null, orgId, venueId)} className={btnPrimary}>
                  Save changes
                </button>
              </div>
            ) : (
              <p className="text-caption text-muted">You can view venue details, but editing requires manager access.</p>
            )}
          </form>
        </div>

        {/* ══════════════════════════════════════════════
            SECTION 2 — HAPPY HOUR TIMES
        ══════════════════════════════════════════════ */}
        <div className="rounded-lg border border-border bg-surface p-6 shadow-sm mb-8">
          <div className="mb-5">
            <h2 className="text-heading-sm font-semibold text-foreground">Happy hour times</h2>
            <p className="text-body-sm text-muted mt-0.5">Define when happy hours are active and which menus apply.</p>
          </div>

          {(happyHours as HappyHourWindow[] | null)?.length ? (
            <div className="flex flex-col gap-4">
              {(happyHours as HappyHourWindow[]).map((h) => {
                const isPublished = (h.status ?? '').toLowerCase() === HH_STATUS_PUBLISHED;
                const selectedMenus = menuSelections.get(h.id) ?? new Set<string>();
                const statusColor = isPublished
                  ? 'bg-success-light text-success'
                  : 'bg-warning-light text-warning';

                return (
                  <div key={h.id} className="rounded-lg border border-border bg-background p-5">
                    {/* ── Window summary row ── */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-md bg-brand-subtle flex items-center justify-center shrink-0">
                          <span className="text-heading-sm font-bold text-brand-dark">&#9200;</span>
                        </div>
                        <div>
                          <h3 className="text-body-md font-semibold text-foreground">{formatDays(h.dow)}</h3>
                          <p className="text-body-sm text-muted mt-0.5">
                            {timeForInput(h.start_time)} – {timeForInput(h.end_time)}
                            {h.label ? <span className="text-muted-light"> · {h.label}</span> : null}
                          </p>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-caption font-medium mt-1 ${statusColor}`}>
                            {isPublished ? 'Published' : 'Draft'}
                          </span>
                        </div>
                      </div>

                      {canManageVenue ? (
                        <form>
                          <input type="hidden" name="hh_id" value={h.id} />
                          {isPublished ? (
                            <button className={btnSecondary} formAction={unpublishHappyHour.bind(null, orgId, venueId)}>
                              Unpublish
                            </button>
                          ) : (
                            <button className={btnPrimary} formAction={publishHappyHour.bind(null, orgId, venueId)}>
                              Publish
                            </button>
                          )}
                        </form>
                      ) : null}
                    </div>

                    {canManageVenue ? (
                      <>
                        {/* ── Edit window ── */}
                        <div className="border-t border-border mt-4 pt-4">
                          <form className="flex flex-col gap-4">
                            <input type="hidden" name="hh_id" value={h.id} />

                            <div>
                              <p className="text-caption font-medium text-muted mb-2">Days</p>
                              <div className="flex flex-wrap gap-x-4 gap-y-2">
                                {DOW.map((d, i) => (
                                  <label key={d} className="flex items-center gap-2 text-body-sm text-foreground cursor-pointer">
                                    <input
                                      type="checkbox"
                                      name="dow"
                                      value={i}
                                      defaultChecked={(h.dow ?? []).includes(i)}
                                      className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
                                    />
                                    {d}
                                  </label>
                                ))}
                              </div>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              <div>
                                <label className="text-caption font-medium text-muted block mb-1">Start</label>
                                <input name="start_time" type="time" defaultValue={timeForInput(h.start_time)} required className={inputCls} />
                              </div>
                              <div>
                                <label className="text-caption font-medium text-muted block mb-1">End</label>
                                <input name="end_time" type="time" defaultValue={timeForInput(h.end_time)} required className={inputCls} />
                              </div>
                              <div className="col-span-2">
                                <label className="text-caption font-medium text-muted block mb-1">Label (optional)</label>
                                <input name="label" defaultValue={h.label ?? ''} placeholder="e.g., Late night, Brunch" className={inputCls} />
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <button className={btnSecondary} formAction={updateHappyHour.bind(null, orgId, venueId)}>
                                Save
                              </button>
                              <button className={btnDanger} formAction={deleteHappyHour.bind(null, orgId, venueId)}>
                                Delete
                              </button>
                            </div>
                          </form>
                        </div>

                        {/* ── Menu associations ── */}
                        <div className="border-t border-border mt-4 pt-4">
                          <p className="text-body-sm font-medium text-foreground mb-2">Menus available in this window</p>
                          {menuList.length ? (
                            <form className="flex flex-col gap-3">
                              <input type="hidden" name="hh_id" value={h.id} />
                              <div className="flex flex-wrap gap-x-4 gap-y-2">
                                {menuList.map((menu) => (
                                  <label key={menu.id} className="flex items-center gap-2 text-body-sm text-foreground cursor-pointer">
                                    <input
                                      type="checkbox"
                                      name="menu_ids"
                                      value={menu.id}
                                      defaultChecked={selectedMenus.has(menu.id)}
                                      className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
                                    />
                                    {menu.name}
                                  </label>
                                ))}
                              </div>
                              <div>
                                <button className={btnSecondary} formAction={updateHappyHourMenus.bind(null, orgId, venueId)}>
                                  Save menus
                                </button>
                              </div>
                            </form>
                          ) : (
                            <p className="text-caption text-muted">Create a menu below to attach it to this window.</p>
                          )}
                        </div>
                      </>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border-strong bg-background/50 p-8 text-center">
              <div className="text-muted-light text-display-md mb-2">&#9200;</div>
              <p className="text-body-sm font-medium text-foreground">No happy hour times yet</p>
              <p className="text-body-sm text-muted mt-1">Add your first window below to get started.</p>
            </div>
          )}

          {/* ── Create new window ── */}
          {canManageVenue ? (
            <div className="border-t border-border mt-6 pt-6">
              <p className="text-body-sm font-medium text-foreground mb-3">Add a new window</p>
              <form className="flex flex-col gap-4">
                <div>
                  <p className="text-caption font-medium text-muted mb-2">Days</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {DOW.map((d, i) => (
                      <label key={d} className="flex items-center gap-2 text-body-sm text-foreground cursor-pointer">
                        <input
                          type="checkbox"
                          name="dow"
                          value={i}
                          defaultChecked={i === 1}
                          className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
                        />
                        {d}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="text-caption font-medium text-muted block mb-1">Start</label>
                    <input name="start_time" type="time" required className={inputCls} />
                  </div>
                  <div>
                    <label className="text-caption font-medium text-muted block mb-1">End</label>
                    <input name="end_time" type="time" required className={inputCls} />
                  </div>
                  <div className="col-span-2">
                    <label className="text-caption font-medium text-muted block mb-1">Label (optional)</label>
                    <input name="label" placeholder="e.g., Late night, Brunch" className={inputCls} />
                  </div>
                </div>

                <div>
                  <button formAction={addHappyHour.bind(null, orgId, venueId)} className={btnPrimary}>
                    Add window (draft)
                  </button>
                </div>
              </form>
            </div>
          ) : null}
        </div>

        {/* ══════════════════════════════════════════════
            SECTION 3 — MENUS
        ══════════════════════════════════════════════ */}
        <div className="rounded-lg border border-border bg-surface p-6 shadow-sm mb-8">
          <div className="flex items-start justify-between mb-5">
            <div>
              <h2 className="text-heading-sm font-semibold text-foreground">Menus</h2>
              <p className="text-body-sm text-muted mt-0.5">Structured menus with sections and items.</p>
            </div>
          </div>

          {/* Create menu */}
          {canManageVenue ? (
            <form className="flex gap-3 items-end mb-6">
              <div className="flex-1">
                <label className="text-body-sm font-medium text-foreground block mb-1.5">New menu</label>
                <input name="menu_name" placeholder="e.g., Happy Hour Drinks" required className={inputCls} />
              </div>
              <button formAction={createMenu.bind(null, orgId, venueId)} className={btnPrimary + ' shrink-0'}>
                Create menu
              </button>
            </form>
          ) : null}

          {(menus as Menu[] | null)?.length ? (
            <div className="flex flex-col gap-6">
              {(menus as Menu[]).map((m) => {
                const menuPublished = (m.status ?? '').toLowerCase() === HH_STATUS_PUBLISHED;
                const menuStatusColor = menuPublished
                  ? 'bg-success-light text-success'
                  : 'bg-warning-light text-warning';

                return (
                  <div key={m.id} className="rounded-lg border border-border bg-background">
                    {/* ── Menu header ── */}
                    <div className="p-5 border-b border-border">
                      {canManageVenue ? (
                        <form className="flex flex-col gap-3">
                          <input type="hidden" name="menu_id" value={m.id} />

                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 flex flex-col gap-3 sm:flex-row sm:items-center">
                              <input name="menu_name" defaultValue={m.name} required className={inputCls + ' sm:max-w-xs'} />
                              <label className="flex items-center gap-2 text-body-sm text-muted cursor-pointer">
                                <input
                                  type="checkbox"
                                  name="menu_is_active"
                                  defaultChecked={m.is_active}
                                  className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
                                />
                                Active
                              </label>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-caption font-medium ${menuStatusColor}`}>
                                {menuPublished ? 'Published' : 'Draft'}
                              </span>
                              {menuPublished ? (
                                <button className={btnSecondary} formAction={unpublishMenu.bind(null, orgId, venueId)}>
                                  Unpublish
                                </button>
                              ) : (
                                <button className={btnPrimary} formAction={publishMenu.bind(null, orgId, venueId)}>
                                  Publish
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button className={btnSecondary} formAction={updateMenu.bind(null, orgId, venueId)}>
                              Save
                            </button>
                            <button className={btnDanger} formAction={deleteMenu.bind(null, orgId, venueId)}>
                              Delete
                            </button>
                          </div>
                        </form>
                      ) : (
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-body-md font-semibold text-foreground">{m.name}</h3>
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-caption font-medium mt-1 ${menuStatusColor}`}>
                              {menuPublished ? 'Published' : 'Draft'}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* ── Sections ── */}
                    <div className="p-5">
                      {/* Add section */}
                      {canManageVenue ? (
                        <form className="flex gap-3 items-end mb-5">
                          <input type="hidden" name="menu_id" value={m.id} />
                          <div className="flex-1">
                            <label className="text-caption font-medium text-muted block mb-1">New section</label>
                            <input name="section_name" placeholder="e.g., Cocktails" required className={inputCls} />
                          </div>
                          <button className={btnSecondary + ' shrink-0'} formAction={createSection.bind(null, orgId, venueId)}>
                            Add section
                          </button>
                        </form>
                      ) : null}

                      {(m.menu_sections ?? []).length ? (
                        <div className="flex flex-col gap-5">
                          {(m.menu_sections ?? []).map((s) => (
                            <div key={s.id} className="rounded-md border border-border bg-surface p-4">
                              {/* Section header */}
                              {canManageVenue ? (
                                <form className="flex items-center gap-3 mb-4">
                                  <input type="hidden" name="section_id" value={s.id} />
                                  <input name="section_name" defaultValue={s.name} required className={inputCls + ' flex-1'} />
                                  <button className={btnSecondary} formAction={updateSection.bind(null, orgId, venueId)}>
                                    Save
                                  </button>
                                  <button className={btnDanger} formAction={deleteSection.bind(null, orgId, venueId)}>
                                    Delete
                                  </button>
                                </form>
                              ) : (
                                <h4 className="text-body-sm font-semibold text-foreground mb-4">{s.name}</h4>
                              )}

                              {/* Add item */}
                              {canEditMenuItems ? (
                                <form className="rounded-md border border-dashed border-border-strong bg-background/50 p-4 mb-4">
                                  <input type="hidden" name="section_id" value={s.id} />
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                                    <div>
                                      <label className="text-caption font-medium text-muted block mb-1">Item name</label>
                                      <input name="item_name" placeholder="Item name" required className={inputCls} />
                                    </div>
                                    <div>
                                      <label className="text-caption font-medium text-muted block mb-1">Price</label>
                                      <input name="item_price" type="number" step="0.01" placeholder="Optional" className={inputCls} />
                                    </div>
                                  </div>
                                  <div className="mb-3">
                                    <label className="text-caption font-medium text-muted block mb-1">Description</label>
                                    <textarea name="item_description" placeholder="Optional description" rows={2} className={inputCls + ' h-auto py-2'} />
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <label className="flex items-center gap-2 text-body-sm text-muted cursor-pointer">
                                      <input
                                        type="checkbox"
                                        name="item_is_happy_hour"
                                        className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
                                      />
                                      Happy hour item
                                    </label>
                                    <button className={btnSecondary} formAction={createItem.bind(null, orgId, venueId)}>
                                      Add item
                                    </button>
                                  </div>
                                </form>
                              ) : (
                                <p className="text-caption text-muted mb-4">Menu items are read-only for your role.</p>
                              )}

                              {/* Item list */}
                              {(s.menu_items ?? []).length ? (
                                <div className="flex flex-col gap-3">
                                  {(s.menu_items ?? []).map((it) => (
                                    <div key={it.id} className="rounded-md border border-border bg-background p-4">
                                      {canEditMenuItems ? (
                                        <form className="flex flex-col gap-3">
                                          <input type="hidden" name="item_id" value={it.id} />
                                          <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-3">
                                            <input name="item_name" defaultValue={it.name} required className={inputCls} />
                                            <input
                                              name="item_price"
                                              type="number"
                                              step="0.01"
                                              defaultValue={it.price ?? ''}
                                              placeholder="Price"
                                              className={inputCls}
                                            />
                                          </div>
                                          <textarea
                                            name="item_description"
                                            defaultValue={it.description ?? ''}
                                            placeholder="Description (optional)"
                                            rows={2}
                                            className={inputCls + ' h-auto py-2'}
                                          />
                                          <div className="flex items-center justify-between">
                                            <label className="flex items-center gap-2 text-body-sm text-muted cursor-pointer">
                                              <input
                                                type="checkbox"
                                                name="item_is_happy_hour"
                                                defaultChecked={!!it.is_happy_hour}
                                                className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
                                              />
                                              Happy hour item
                                            </label>
                                            <div className="flex items-center gap-2">
                                              <button className={btnSecondary} formAction={updateItem.bind(null, orgId, venueId)}>
                                                Save
                                              </button>
                                              <button className={btnDanger} formAction={deleteItem.bind(null, orgId, venueId)}>
                                                Delete
                                              </button>
                                            </div>
                                          </div>
                                        </form>
                                      ) : (
                                        <div>
                                          <div className="flex items-center justify-between">
                                            <h5 className="text-body-sm font-semibold text-foreground">{it.name}</h5>
                                            {it.price != null ? (
                                              <span className="text-body-sm font-medium text-foreground">${Number(it.price).toFixed(2)}</span>
                                            ) : null}
                                          </div>
                                          <p className="text-caption text-muted mt-0.5">{it.description ?? 'No description'}</p>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-caption text-muted text-center py-2">No items yet.</p>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-caption text-muted">No sections yet. Add one above.</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border-strong bg-background/50 p-8 text-center">
              <div className="text-muted-light text-display-md mb-2">&#127860;</div>
              <p className="text-body-sm font-medium text-foreground">No menus yet</p>
              <p className="text-body-sm text-muted mt-1">Create your first menu above to start building.</p>
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════════
            SECTION 3B — TAGS & CUISINE
        ══════════════════════════════════════════════ */}
        <div className="rounded-lg border border-border bg-surface p-6 shadow-sm mb-8">
          <div className="mb-5">
            <h2 className="text-heading-sm font-semibold text-foreground">Tags &amp; Cuisine</h2>
            <p className="text-body-sm text-muted mt-0.5">Select tags from the approved pool to help people find your venue.</p>
          </div>

          {canManageVenue ? (
            <form className="flex flex-col gap-5">
              {/* Cuisine type */}
              <div>
                <label htmlFor="cuisine-type" className="text-body-sm font-medium text-foreground block mb-1.5">Primary cuisine</label>
                <select id="cuisine-type" name="cuisine_type" defaultValue={v?.cuisine_type ?? ''} className={selectCls}>
                  <option value="">None selected</option>
                  {(approvedTags as ApprovedTagRow[] | null)
                    ?.filter((t) => t.category === 'cuisine')
                    .map((t) => (
                      <option key={t.id} value={t.slug}>{t.label}</option>
                    ))}
                </select>
              </div>

              {/* Tags by category */}
              {['cuisine', 'vibe', 'feature', 'drink_type'].map((cat) => {
                const catTags = (approvedTags as ApprovedTagRow[] | null)?.filter((t) => t.category === cat) ?? [];
                if (catTags.length === 0) return null;
                const selectedIds = new Set((currentVenueTags as VenueTagRow[] | null)?.map((vt) => vt.tag_id) ?? []);
                const catLabel = cat === 'drink_type' ? 'Drink Type' : cat.charAt(0).toUpperCase() + cat.slice(1);

                return (
                  <div key={cat}>
                    <p className="text-caption font-medium text-muted mb-2">{catLabel}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      {catTags.map((tag) => (
                        <label key={tag.id} className="flex items-center gap-2 text-body-sm text-foreground cursor-pointer">
                          <input
                            type="checkbox"
                            name="tag_ids"
                            value={tag.id}
                            defaultChecked={selectedIds.has(tag.id)}
                            className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
                          />
                          {tag.label}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}

              <div>
                <button formAction={updateVenueTags.bind(null, orgId, venueId)} className={btnPrimary}>
                  Save tags
                </button>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap gap-2">
              {(currentVenueTags as VenueTagRow[] | null)?.length ? (
                (approvedTags as ApprovedTagRow[] | null)
                  ?.filter((t) => (currentVenueTags as VenueTagRow[]).some((vt) => vt.tag_id === t.id))
                  .map((t) => (
                    <span key={t.id} className="inline-flex items-center rounded-full bg-brand-subtle px-2.5 py-1 text-caption font-medium text-brand-text">
                      {t.label}
                    </span>
                  ))
              ) : (
                <p className="text-caption text-muted">No tags assigned yet.</p>
              )}
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════════
            SECTION 3C — EVENTS
        ══════════════════════════════════════════════ */}
        <div className="rounded-lg border border-border bg-surface p-6 shadow-sm mb-8">
          <div className="mb-5">
            <h2 className="text-heading-sm font-semibold text-foreground">Events</h2>
            <p className="text-body-sm text-muted mt-0.5">Upcoming events, specials, live music, trivia, and more.</p>
          </div>

          {(venueEvents as VenueEventRow[] | null)?.length ? (
            <div className="flex flex-col gap-4">
              {(venueEvents as VenueEventRow[]).map((ev) => {
                const isPublished = ev.status === 'published';
                const statusColor = isPublished
                  ? 'bg-success-light text-success'
                  : 'bg-warning-light text-warning';
                const eventDate = new Date(ev.starts_at);
                const dateStr = eventDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                const timeStr = eventDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

                return (
                  <div key={ev.id} className="rounded-lg border border-border bg-background p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-md bg-brand-subtle flex items-center justify-center shrink-0">
                          <span className="text-heading-sm font-bold text-brand-dark">&#127881;</span>
                        </div>
                        <div>
                          <h3 className="text-body-md font-semibold text-foreground">{ev.title}</h3>
                          <p className="text-body-sm text-muted mt-0.5">
                            {ev.is_recurring ? formatRecurrence(ev.recurrence_rule) : dateStr} at {timeStr}
                            {ev.ends_at && ` – ${new Date(ev.ends_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`}
                            {ev.event_type !== 'event' && <span className="text-muted-light"> · {ev.event_type.replace('_', ' ')}</span>}
                          </p>
                          {ev.price_info && <p className="text-caption text-muted mt-0.5">{ev.price_info}</p>}
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-caption font-medium ${statusColor}`}>
                              {isPublished ? 'Published' : 'Draft'}
                            </span>
                            {ev.is_recurring && (
                              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-caption font-medium bg-brand-subtle text-brand-dark">
                                &#x1f501; Recurring
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {canManageVenue ? (
                        <form>
                          <input type="hidden" name="event_id" value={ev.id} />
                          {isPublished ? (
                            <button className={btnSecondary} formAction={unpublishEvent.bind(null, orgId, venueId)}>
                              Unpublish
                            </button>
                          ) : (
                            <button className={btnPrimary} formAction={publishEvent.bind(null, orgId, venueId)}>
                              Publish
                            </button>
                          )}
                        </form>
                      ) : null}
                    </div>

                    {canManageVenue ? (
                      <div className="border-t border-border mt-4 pt-4">
                        <form className="flex flex-col gap-4">
                          <input type="hidden" name="event_id" value={ev.id} />

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="text-caption font-medium text-muted block mb-1">Title</label>
                              <input name="event_title" defaultValue={ev.title} required className={inputCls} />
                            </div>
                            <div>
                              <label className="text-caption font-medium text-muted block mb-1">Type</label>
                              <select name="event_type" defaultValue={ev.event_type} className={selectCls}>
                                <option value="event">Event</option>
                                <option value="special">Special</option>
                                <option value="live_music">Live Music</option>
                                <option value="trivia">Trivia</option>
                                <option value="sports">Sports</option>
                                <option value="other">Other</option>
                              </select>
                            </div>
                          </div>

                          <div>
                            <label className="text-caption font-medium text-muted block mb-1">Description</label>
                            <textarea name="event_description" defaultValue={ev.description ?? ''} rows={2} className={inputCls + ' h-auto py-2'} />
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div>
                              <label className="text-caption font-medium text-muted block mb-1">Starts at</label>
                              <input name="starts_at" type="datetime-local" defaultValue={ev.starts_at.slice(0, 16)} required className={inputCls} />
                            </div>
                            <div>
                              <label className="text-caption font-medium text-muted block mb-1">Ends at</label>
                              <input name="ends_at" type="datetime-local" defaultValue={ev.ends_at?.slice(0, 16) ?? ''} className={inputCls} />
                            </div>
                            <div>
                              <label className="text-caption font-medium text-muted block mb-1">Price info</label>
                              <input name="price_info" defaultValue={ev.price_info ?? ''} placeholder="e.g., Free, $10" className={inputCls} />
                            </div>
                            <div>
                              <label className="text-caption font-medium text-muted block mb-1">Capacity</label>
                              <input name="capacity" type="number" defaultValue={ev.capacity ?? ''} className={inputCls} />
                            </div>
                          </div>

                          {/* ── Recurring schedule ── */}
                          <div className="rounded-md border border-border bg-surface p-4">
                            <label className="flex items-center gap-2 text-body-sm text-foreground cursor-pointer mb-3">
                              <input
                                type="checkbox"
                                name="is_recurring"
                                defaultChecked={ev.is_recurring}
                                className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
                              />
                              <span className="font-medium">Recurring event</span>
                              <span className="text-caption text-muted">(repeats on selected days, like happy hours)</span>
                            </label>

                            <div>
                              <p className="text-caption font-medium text-muted mb-2">Repeat on</p>
                              <div className="flex flex-wrap gap-x-4 gap-y-2">
                                {DOW.map((d, i) => {
                                  const rruleDow = parseRruleDow(ev.recurrence_rule);
                                  return (
                                    <label key={d} className="flex items-center gap-2 text-body-sm text-foreground cursor-pointer">
                                      <input
                                        type="checkbox"
                                        name="event_dow"
                                        value={i}
                                        defaultChecked={rruleDow.includes(i)}
                                        className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
                                      />
                                      {d}
                                    </label>
                                  );
                                })}
                              </div>
                            </div>

                            <div className="mt-3">
                              <label className="text-caption font-medium text-muted block mb-1">Timezone</label>
                              <input name="timezone" defaultValue={ev.timezone ?? 'America/Chicago'} className={inputCls + ' max-w-xs'} />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="text-caption font-medium text-muted block mb-1">External URL</label>
                              <input name="external_url" type="url" defaultValue={ev.external_url ?? ''} placeholder="https://..." className={inputCls} />
                            </div>
                            <div>
                              <label className="text-caption font-medium text-muted block mb-1">Ticket URL</label>
                              <input name="ticket_url" type="url" defaultValue={ev.ticket_url ?? ''} placeholder="https://..." className={inputCls} />
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button className={btnSecondary} formAction={updateEvent.bind(null, orgId, venueId)}>
                              Save
                            </button>
                            <button className={btnDanger} formAction={deleteEvent.bind(null, orgId, venueId)}>
                              Delete
                            </button>
                          </div>
                        </form>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border-strong bg-background/50 p-8 text-center">
              <div className="text-muted-light text-display-md mb-2">&#127881;</div>
              <p className="text-body-sm font-medium text-foreground">No events yet</p>
              <p className="text-body-sm text-muted mt-1">Add your first event below to promote specials, live music, trivia, and more.</p>
            </div>
          )}

          {/* Create new event */}
          {canManageVenue ? (
            <div className="border-t border-border mt-6 pt-6">
              <p className="text-body-sm font-medium text-foreground mb-3">Add a new event</p>
              <form className="flex flex-col gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-caption font-medium text-muted block mb-1">Title</label>
                    <input name="event_title" placeholder="e.g., Live Jazz Night" required className={inputCls} />
                  </div>
                  <div>
                    <label className="text-caption font-medium text-muted block mb-1">Type</label>
                    <select name="event_type" className={selectCls}>
                      <option value="event">Event</option>
                      <option value="special">Special</option>
                      <option value="live_music">Live Music</option>
                      <option value="trivia">Trivia</option>
                      <option value="sports">Sports</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-caption font-medium text-muted block mb-1">Description</label>
                  <textarea name="event_description" placeholder="What's happening?" rows={2} className={inputCls + ' h-auto py-2'} />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="text-caption font-medium text-muted block mb-1">Starts at</label>
                    <input name="starts_at" type="datetime-local" required className={inputCls} />
                  </div>
                  <div>
                    <label className="text-caption font-medium text-muted block mb-1">Ends at</label>
                    <input name="ends_at" type="datetime-local" className={inputCls} />
                  </div>
                  <div>
                    <label className="text-caption font-medium text-muted block mb-1">Price info</label>
                    <input name="price_info" placeholder="e.g., Free, $5 cover" className={inputCls} />
                  </div>
                  <div>
                    <label className="text-caption font-medium text-muted block mb-1">Capacity</label>
                    <input name="capacity" type="number" placeholder="Optional" className={inputCls} />
                  </div>
                </div>

                {/* ── Recurring schedule ── */}
                <div className="rounded-md border border-border bg-surface p-4">
                  <label className="flex items-center gap-2 text-body-sm text-foreground cursor-pointer mb-3">
                    <input
                      type="checkbox"
                      name="is_recurring"
                      className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
                    />
                    <span className="font-medium">Recurring event</span>
                    <span className="text-caption text-muted">(repeats weekly on selected days)</span>
                  </label>

                  <div>
                    <p className="text-caption font-medium text-muted mb-2">Repeat on</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      {DOW.map((d, i) => (
                        <label key={d} className="flex items-center gap-2 text-body-sm text-foreground cursor-pointer">
                          <input
                            type="checkbox"
                            name="event_dow"
                            value={i}
                            className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
                          />
                          {d}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="mt-3">
                    <label className="text-caption font-medium text-muted block mb-1">Timezone</label>
                    <input name="timezone" defaultValue={v?.timezone ?? 'America/Chicago'} className={inputCls + ' max-w-xs'} />
                  </div>
                </div>

                <div>
                  <button formAction={createEvent.bind(null, orgId, venueId)} className={btnPrimary}>
                    Add event (draft)
                  </button>
                </div>
              </form>
            </div>
          ) : null}
        </div>

        {/* ══════════════════════════════════════════════
            SECTION 4 — MEDIA
        ══════════════════════════════════════════════ */}
        {canManageVenue ? (
          <div className="rounded-lg border border-border bg-surface p-6 shadow-sm mb-8">
            <div className="mb-5">
              <h2 className="text-heading-sm font-semibold text-foreground">Media</h2>
              <p className="text-body-sm text-muted mt-0.5">Upload images, videos, or menu PDFs for this venue.</p>
            </div>
            <VenueMediaUploader orgId={orgId} venueId={venueId} />
          </div>
        ) : null}

        {/* ══════════════════════════════════════════════
            SECTION 5 — ANALYTICS
        ══════════════════════════════════════════════ */}
        <div className="rounded-lg border border-border bg-surface p-6 shadow-sm mb-8">
          <div className="mb-5">
            <h2 className="text-heading-sm font-semibold text-foreground">Analytics</h2>
            <p className="text-body-sm text-muted mt-0.5">
              Event counts from the consumer app (<code className="text-caption bg-background px-1.5 py-0.5 rounded border border-border">venue_event_counts</code> view).
            </p>
          </div>

          {(eventCounts as EventCount[] | null)?.length ? (
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-background">
                    <th className="text-left text-caption font-medium text-muted px-4 py-2.5">Event type</th>
                    <th className="text-right text-caption font-medium text-muted px-4 py-2.5">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {(eventCounts as EventCount[]).map((e, i) => (
                    <tr key={e.event_type} className={`border-b border-border last:border-b-0 ${i % 2 === 0 ? 'bg-surface' : 'bg-background/50'}`}>
                      <td className="text-body-sm text-foreground font-medium px-4 py-2.5">{e.event_type}</td>
                      <td className="text-body-sm text-muted text-right tabular-nums px-4 py-2.5">{e.cnt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border-strong bg-background/50 p-8 text-center">
              <div className="text-muted-light text-display-md mb-2">&#128202;</div>
              <p className="text-body-sm font-medium text-foreground">No events recorded yet</p>
              <p className="text-body-sm text-muted mt-1">Analytics will appear here as users interact with your venue.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
