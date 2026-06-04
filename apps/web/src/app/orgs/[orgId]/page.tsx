import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import UserBar from '@/components/layout/UserBar';
import MenuSectionItemAdder from '@/components/MenuSectionItemAdder';
import ConfirmDeleteForm from '@/components/ConfirmDeleteForm';
import { FlashMessage } from '@/components/FlashMessage';
import { SubmitButton } from '@/components/ui/SubmitButton';
import VenueDashboardShell, { type ShellTab } from '@/components/venue/VenueDashboardShell';
import AccessManager, { type InviteRow, type MemberRow } from '@/components/venue/AccessManager';
import Disclosure from '@/components/venue/Disclosure';
import ConfirmDeleteToast from '@/components/venue/ConfirmDeleteToast';
import VenueMenusManager, {
  type VMM_Menu,
  type VMM_PublishedVenueMenuOption,
} from '@/components/venue/VenueMenusManager';
import { MENU_TREE_SELECT } from '@/actions/menu-tree';
import { createClient } from '@/utils/supabase/server';
import { createServiceClient } from '@/utils/supabase/server';
import { isAdminEmail } from '@/utils/admin-emails';
import {
  createOrganizationMenu,
  createOrganizationMenuItem,
  createOrganizationMenuSection,
  createVenue,
  deleteOrganizationMenu,
  deleteOrganizationMenuItem,
  deleteOrganizationMenuSection,
  deleteVenue,
  publishOrganizationMenu,
  saveOrganizationMenu,
  syncOrganizationMenuToVenues,
  unpublishOrganizationMenu,
} from '../../../actions/organization-actions';
import { deleteOrganization, saveOrgNotificationPrefs, updateOrganization } from '@/actions/dashboard-actions';
import {
  addHappyHour,
  updateHappyHour,
  deleteHappyHour,
  publishHappyHour,
  unpublishHappyHour,
  updateHappyHourMenus,
  createMenu,
  importOrganizationMenu,
  importPublishedVenueMenu,
  saveMenu,
  publishMenu,
  unpublishMenu,
  deleteMenu,
  createSection,
  deleteSection,
  createItem,
  deleteItem,
} from '@/actions/venue-actions';
import { fetchVenuesByOrg, type VenueSummary as VenueRow } from '@happitime/shared-api';
import { loginPathFor } from '@/utils/auth-paths';
import { OrgBundlePanel } from '@/components/OrgBundlePanel';
import { OrgSubscriptionStatus, type VenuePlanRow } from '@/components/OrgSubscriptionStatus';
import type { SubscriptionPlan } from '@/utils/stripe';

const HH_STATUS_PUBLISHED = 'published';

// ── Happy-hour status rollup helpers ─────────────────────────────────────────
// DOW convention matches the venue detail page: 0=Sun … 6=Sat.
const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type HHWindow = {
  id: string;
  venue_id: string;
  dow: number[] | null;
  start_time: string | null;
  end_time: string | null;
  timezone: string | null;
  status: string | null;
  label: string | null;
};

/** Normalizes a stored time string to the "HH:MM" value an <input type="time"> expects. */
function hhTimeForInput(t: string | null): string {
  if (!t) return '';
  return t.length >= 5 ? t.slice(0, 5) : t;
}

function hhTimeToMinutes(t: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h)) return null;
  return h * 60 + (m || 0);
}
function hhFmtTime(t: string | null): string {
  const mins = hhTimeToMinutes(t);
  if (mins == null) return '';
  const h = Math.floor(mins / 60), m = mins % 60;
  const ap = h < 12 ? 'AM' : 'PM';
  const h12 = ((h + 11) % 12) + 1;
  return m ? `${h12}:${String(m).padStart(2, '0')} ${ap}` : `${h12} ${ap}`;
}
function hhFmtRange(s: string | null, e: string | null): string {
  const sm = hhTimeToMinutes(s), em = hhTimeToMinutes(e);
  if (sm == null || em == null) return '';
  const sH = Math.floor(sm / 60), sMin = sm % 60, eH = Math.floor(em / 60), eMin = em % 60;
  const ap = (h: number) => (h < 12 ? 'AM' : 'PM');
  const h12 = (h: number) => ((h + 11) % 12) + 1;
  const sStr = `${h12(sH)}${sMin ? `:${String(sMin).padStart(2, '0')}` : ''}`;
  const eStr = `${h12(eH)}${eMin ? `:${String(eMin).padStart(2, '0')}` : ''} ${ap(eH)}`;
  return ap(sH) === ap(eH) ? `${sStr}–${eStr}` : `${sStr} ${ap(sH)}–${eStr}`;
}
function hhFmtDays(days: number[] | null): string {
  const d = [...new Set((days ?? []).filter((n) => n >= 0 && n <= 6))].sort((a, b) => a - b);
  if (!d.length) return '';
  if (d.length === 7) return 'Daily';
  const runs: [number, number][] = [];
  let start = d[0], prev = d[0];
  for (let i = 1; i < d.length; i++) {
    if (d[i] === prev + 1) prev = d[i];
    else { runs.push([start, prev]); start = prev = d[i]; }
  }
  runs.push([start, prev]);
  return runs.map(([a, b]) => (a === b ? DOW_LABELS[a] : `${DOW_LABELS[a]}–${DOW_LABELS[b]}`)).join(', ');
}
// "Now" in the venue's timezone — so "Live now" reflects local happy-hour time.
function hhNowInTz(tz: string | null): { dow: number; minutes: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz || 'America/Chicago', hour12: false, weekday: 'short', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date());
    const wd = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
    const hr = (Number(parts.find((p) => p.type === 'hour')?.value) || 0) % 24;
    const mn = Number(parts.find((p) => p.type === 'minute')?.value) || 0;
    const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return { dow: map[wd] ?? 0, minutes: hr * 60 + mn };
  } catch {
    const d = new Date();
    return { dow: d.getDay(), minutes: d.getHours() * 60 + d.getMinutes() };
  }
}

type HHStatusKind = 'live' | 'soon' | 'scheduled' | 'draft' | 'none';
function computeHoursStatus(windows: HHWindow[]): {
  kind: HHStatusKind;
  label: string;
  count: number;
  summary: string;
} {
  const count = windows.length;
  if (!count) return { kind: 'none', label: 'No windows yet', count, summary: '' };

  const published = windows.filter((w) => (w.status ?? '').toLowerCase() === HH_STATUS_PUBLISHED);
  const now = hhNowInTz(windows[0]?.timezone ?? null);

  let live: HHWindow | null = null, liveEnd = Infinity;
  let soon: HHWindow | null = null, soonStart = Infinity;
  for (const w of published) {
    const s = hhTimeToMinutes(w.start_time), e = hhTimeToMinutes(w.end_time);
    if (s == null || e == null || !(w.dow ?? []).includes(now.dow)) continue;
    if (now.minutes >= s && now.minutes < e) { if (e < liveEnd) { live = w; liveEnd = e; } }
    else if (now.minutes < s && s < soonStart) { soon = w; soonStart = s; }
  }

  const rep = live ?? soon ?? published[0] ?? windows[0];
  const summary = rep ? `${hhFmtDays(rep.dow)} ${hhFmtRange(rep.start_time, rep.end_time)}`.trim() : '';

  if (live) return { kind: 'live', label: `Live now · until ${hhFmtTime(live.end_time)}`, count, summary };
  if (soon) return { kind: 'soon', label: `Starts ${hhFmtTime(soon.start_time)}`, count, summary };
  if (published.length) return { kind: 'scheduled', label: 'Scheduled', count, summary };
  return { kind: 'draft', label: 'Draft only', count, summary };
}

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

type OrganizationMenu = {
  id: string;
  name: string;
  status?: string;
  is_active: boolean;
  menu_sections: MenuSection[] | null;
};

export default async function OrgPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ error?: string; from?: string; bundle?: string }>;
}) {
  const { orgId } = await params;
  const sp = await searchParams;
  const pageError = sp?.error;
  const fromAdmin = sp?.from === 'admin';

  const authClient = await createClient();
  const { data: auth } = await authClient.auth.getUser();
  const user = auth.user;

  if (!user) {
    redirect(loginPathFor(`/orgs/${orgId}`));
  }

  const userIsAdmin = await isAdminEmail(user.email);
  const supabase = (fromAdmin && userIsAdmin) ? createServiceClient() : await createClient();

  const { data: membership } = await (await createClient())
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle();

  const role = String(membership?.role ?? '');
  const isOwner = role === 'owner' || (fromAdmin && userIsAdmin);
  const canManageAccess = ['owner', 'admin'].includes(role) || (fromAdmin && userIsAdmin);
  const canManageOrganizationMenus =
    isOwner || role === 'manager' || role === 'admin' || role === 'editor';

  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('id,name,slug,notify_new_review,notify_happy_hour_reminders,notify_weekly_summary')
    .eq('id', orgId)
    .single();

  const { data: venues, error: venuesErr } = await fetchVenuesByOrg(supabase as any, orgId);

  const venueCount = (venues ?? []).length;
  const canManageBilling = isOwner || role === 'manager' || userIsAdmin;
  const { data: orgBundleRow } = canManageBilling
    ? await (supabase as any)
        .from('org_subscriptions')
        .select('bundle_tier, status, venue_count, monthly_rate_per_venue_cents, current_period_end, stripe_customer_id')
        .eq('org_id', orgId)
        .maybeSingle()
    : { data: null };

  const orgBundle = orgBundleRow && orgBundleRow.status !== 'canceled'
    ? {
        tier: orgBundleRow.bundle_tier as 'bundle_2_4' | 'bundle_5_plus',
        status: orgBundleRow.status as string,
        venueCount: orgBundleRow.venue_count as number,
        monthlyRatePerVenueCents: orgBundleRow.monthly_rate_per_venue_cents as number,
        currentPeriodEnd: (orgBundleRow.current_period_end as string | null) ?? null,
        canManageBilling: Boolean(orgBundleRow.stripe_customer_id),
      }
    : null;

  const { data: organizationMenus, error: organizationMenusErr } = await supabase
    .from('menus')
    .select(
      'id,name,status,is_active,menu_sections(id,name,sort_order,menu_items(id,name,description,price,is_happy_hour,sort_order))'
    )
    .eq('org_id', orgId)
    .eq('scope', 'organization')
    .order('created_at', { ascending: false });

  const organizationMenuList = (organizationMenus as OrganizationMenu[] | null) ?? [];
  const venueRows = (venues as VenueRow[] | null) ?? [];

  // ── Per-venue subscription plans (drives the Subscriptions status block) ──
  const PAID_VENUE_PLANS = ['verified', 'featured', 'founding_pilot'];
  const ACTIVE_SUB_STATUSES = ['active', 'trialing'];
  const subVenueIds = venueRows.map((v) => v.id);
  const { data: venueSubsData } = canManageBilling && subVenueIds.length
    ? await (supabase as any)
        .from('venue_subscriptions')
        .select('venue_id, plan, status')
        .in('venue_id', subVenueIds)
    : { data: null };
  const planByVenue = new Map<string, SubscriptionPlan>();
  for (const s of (venueSubsData as { venue_id: string; plan: string; status: string }[] | null) ?? []) {
    const active = ACTIVE_SUB_STATUSES.includes(s.status) && PAID_VENUE_PLANS.includes(s.plan);
    planByVenue.set(s.venue_id, active ? (s.plan as SubscriptionPlan) : 'listed');
  }
  const venuePlanRows: VenuePlanRow[] = venueRows.map((v) => ({
    id: v.id,
    name: v.name,
    plan: planByVenue.get(v.id) ?? 'listed',
  }));

  // ── Team / access data (only fetched for owners & admins, who see the tab) ──
  const [{ data: members }, { data: assignments }, { data: invites }] = canManageAccess
    ? await Promise.all([
        supabase
          .from('org_members')
          .select('user_id,role,email,first_name,last_name')
          .eq('org_id', orgId)
          .order('created_at', { ascending: true }),
        supabase.from('venue_members').select('venue_id,user_id').eq('org_id', orgId),
        supabase
          .from('org_invites')
          .select('id,email,role,venue_ids,created_at,expires_at,accepted_at,first_name,last_name')
          .eq('org_id', orgId)
          .order('created_at', { ascending: false }),
      ])
    : [{ data: null }, { data: null }, { data: null }];

  const memberRows = (members as MemberRow[] | null) ?? [];
  const inviteRows = (invites as InviteRow[] | null)?.filter((i) => !i.accepted_at) ?? [];
  const assignmentRows = (assignments as { venue_id: string; user_id: string }[] | null) ?? [];
  const venueNameById = new Map(venueRows.map((v) => [v.id, v.name]));
  const assignmentsByUser = new Map<string, string[]>();
  for (const row of assignmentRows) {
    const list = assignmentsByUser.get(row.user_id) ?? [];
    list.push(String(row.venue_id));
    assignmentsByUser.set(row.user_id, list);
  }

  // ── Happy-hour windows for the org's venues ──
  //  These now drive an inline editor (not just a status rollup), so we pull the
  //  window id + label, each venue's own menus, the window→menu associations,
  //  and each venue's street address — everything the per-window editor needs.
  const venueIdList = venueRows.map((v) => v.id);
  const { data: hhWindows } = venueIdList.length
    ? await supabase
        .from('happy_hour_windows')
        .select('id,venue_id,dow,start_time,end_time,timezone,status,label')
        .in('venue_id', venueIdList)
        .order('start_time', { ascending: true })
    : { data: null };
  const windowsByVenue = new Map<string, HHWindow[]>();
  for (const w of (hhWindows as HHWindow[] | null) ?? []) {
    const list = windowsByVenue.get(w.venue_id) ?? [];
    list.push(w);
    windowsByVenue.set(w.venue_id, list);
  }

  // Venue-scoped menus, grouped by venue — the "menus to attach" options.
  const { data: venueMenusData } = venueIdList.length
    ? await supabase
        .from('menus')
        .select('id,name,venue_id')
        .in('venue_id', venueIdList)
        .eq('scope', 'venue')
        .order('name', { ascending: true })
    : { data: null };
  const menusByVenue = new Map<string, { id: string; name: string }[]>();
  for (const m of (venueMenusData as { id: string; name: string; venue_id: string }[] | null) ?? []) {
    const list = menusByVenue.get(m.venue_id) ?? [];
    list.push({ id: m.id, name: m.name });
    menusByVenue.set(m.venue_id, list);
  }

  // Which menus are already attached to each window.
  const windowIdList = (hhWindows as HHWindow[] | null)?.map((w) => w.id) ?? [];
  const { data: windowMenuLinks } = windowIdList.length
    ? await supabase
        .from('happy_hour_window_menus')
        .select('happy_hour_window_id,menu_id')
        .in('happy_hour_window_id', windowIdList)
    : { data: null };
  const menusByWindow = new Map<string, Set<string>>();
  for (const l of (windowMenuLinks as { happy_hour_window_id: string; menu_id: string }[] | null) ?? []) {
    const set = menusByWindow.get(l.happy_hour_window_id) ?? new Set<string>();
    set.add(l.menu_id);
    menusByWindow.set(l.happy_hour_window_id, set);
  }

  // Street address per venue (VenueSummary only carries city/state) for the
  // venue label shown on each window when the org has more than one location.
  const { data: venueAddrData } = venueIdList.length
    ? await supabase.from('venues').select('id,address,city,state,zip').in('id', venueIdList)
    : { data: null };
  const addressByVenue = new Map<string, string>();
  for (const v of (venueAddrData as { id: string; address: string | null; city: string | null; state: string | null; zip: string | null }[] | null) ?? []) {
    const cityState = [v.city, v.state].filter(Boolean).join(', ');
    const full = [v.address, cityState, v.zip].filter(Boolean).join(' · ');
    if (full) addressByVenue.set(v.id, full);
  }

  // ── Venue-scoped menu trees, so the Menus tab can manage every venue's menus
  //  inline (the same editor as the per-venue page, via VenueMenusManager) ──
  const { data: venueMenuTreeData } = venueIdList.length
    ? await supabase
        .from('menus')
        .select(`${MENU_TREE_SELECT},source_menu_id,venue_id`)
        .in('venue_id', venueIdList)
        .eq('scope', 'venue')
        .order('created_at', { ascending: false })
    : { data: null };
  const venueMenusByVenue = new Map<string, (VMM_Menu & { venue_id: string })[]>();
  for (const m of (venueMenuTreeData as (VMM_Menu & { venue_id: string })[] | null) ?? []) {
    const list = venueMenusByVenue.get(m.venue_id) ?? [];
    list.push(m);
    venueMenusByVenue.set(m.venue_id, list);
  }

  // Published venue menus across the org — the "copy from another venue" source
  // list. Filtered per venue (to exclude its own) at render time.
  const { data: publishedVenueMenuData } = venueIdList.length
    ? await supabase
        .from('menus')
        .select('id,name,venue_id,venue:venues!menus_venue_id_fkey(id,name,org_name)')
        .eq('org_id', orgId)
        .eq('scope', 'venue')
        .eq('status', HH_STATUS_PUBLISHED)
        .order('name', { ascending: true })
    : { data: null };
  const allPublishedVenueMenus = (publishedVenueMenuData as VMM_PublishedVenueMenuOption[] | null) ?? [];

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

  // ── Section heading used at the top of each panel ──
  const PanelHeader = ({ title, desc }: { title: string; desc: string }) => (
    <div className="mb-5">
      <h2 className="text-heading-md font-bold text-foreground tracking-tight">{title}</h2>
      <p className="text-body-sm text-muted mt-1">{desc}</p>
    </div>
  );

  // ════════════════════════════════════════════════════════════════════
  //  VENUES PANEL
  // ════════════════════════════════════════════════════════════════════
  const venuesPanel = (
    <div>
      <PanelHeader title="Venues" desc="Manage locations, status, and details for this organization." />

      {canManageBilling && (
        <div className="mb-6">
          <OrgSubscriptionStatus orgId={orgId} venues={venuePlanRows} />
        </div>
      )}

      {canManageBilling && (
        <div className="mb-6">
          <OrgBundlePanel orgId={orgId} venueCount={venueCount} bundle={orgBundle} justCheckedOut={sp?.bundle === 'success'} />
        </div>
      )}

      {/* Add Venue Form */}
      {isOwner ? (
        <div className="rounded-lg border border-border bg-surface p-6 shadow-sm mb-8">
          <div className="mb-4">
            <h3 className="text-heading-sm font-semibold text-foreground">Add a venue</h3>
            <p className="text-body-sm text-muted mt-0.5">Add a new location to this organization.</p>
          </div>
          <form className="flex flex-col gap-4">
            <div>
              <label htmlFor="venue-name" className="text-body-sm font-medium text-foreground block mb-1.5">
                Venue name
              </label>
              <input id="venue-name" name="name" placeholder="e.g., Smith's Taproom" required className={inputCls} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="address" className="text-body-sm font-medium text-foreground block mb-1.5">
                  Street address
                </label>
                <input id="address" name="address" placeholder="123 Main St" required className={inputCls} />
              </div>
              <div>
                <label htmlFor="city" className="text-body-sm font-medium text-foreground block mb-1.5">
                  City
                </label>
                <input id="city" name="city" placeholder="Austin" required className={inputCls} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="state" className="text-body-sm font-medium text-foreground block mb-1.5">
                  State
                </label>
                <input id="state" name="state" placeholder="TX" required className={inputCls} />
              </div>
              <div>
                <label htmlFor="zip" className="text-body-sm font-medium text-foreground block mb-1.5">
                  ZIP code
                </label>
                <input id="zip" name="zip" placeholder="78701" required className={inputCls} />
              </div>
              <div>
                <label htmlFor="timezone" className="text-body-sm font-medium text-foreground block mb-1.5">
                  Timezone
                </label>
                <input id="timezone" name="timezone" defaultValue="America/Chicago" className={inputCls} />
              </div>
            </div>
            <div>
              <button formAction={createVenue.bind(null, orgId)} className={btnPrimary}>
                Create venue
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {/* Venues List */}
      {venuesErr ? (
        <div className="rounded-md border border-error bg-error-light px-4 py-3">
          <p className="text-body-sm font-medium text-error">Database error</p>
          <p className="text-body-sm text-error/80 mt-0.5">{venuesErr.message}</p>
        </div>
      ) : null}

      {venueRows.length ? (
        <div className="flex flex-col gap-3">
          {venueRows.map((v) => {
            const displayName = v.org_name?.trim() || v.name;
            const locationLabel = v.org_name?.trim() && v.org_name !== v.name ? v.name : null;
            const venueHref = fromAdmin
              ? `/orgs/${orgId}/venues/${v.id}?from=admin`
              : `/orgs/${orgId}/venues/${v.id}`;
            const statusColor = v.status === 'published'
              ? 'bg-success-light text-success'
              : v.status === 'draft'
                ? 'bg-warning-light text-warning'
                : 'bg-background text-muted';

            return (
              <div key={v.id} className="rounded-lg border border-border bg-surface shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between p-5">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-md bg-brand-subtle flex items-center justify-center shrink-0">
                      <span className="text-heading-sm font-bold text-brand-dark">
                        {displayName.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <h3 className="text-body-md font-semibold text-foreground">{displayName}</h3>
                      {locationLabel ? <p className="text-caption text-muted">{locationLabel}</p> : null}
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-body-sm text-muted">
                          {(v.city || v.state) ? `${v.city ?? ''}${v.city && v.state ? ', ' : ''}${v.state ?? ''}` : '—'}
                        </span>
                        {v.status ? (
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-caption font-medium ${statusColor}`}>
                            {v.status}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Link href={venueHref}>
                      <span className="inline-flex items-center justify-center h-9 px-4 rounded-md bg-dark text-dark-foreground text-body-sm font-medium hover:bg-dark/90 transition-colors cursor-pointer">
                        Manage
                      </span>
                    </Link>
                    {isOwner ? (
                      <form>
                        <input type="hidden" name="venue_id" value={v.id} />
                        <button formAction={deleteVenue.bind(null, orgId)} className={btnDanger}>
                          Delete
                        </button>
                      </form>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border-strong bg-surface/50 p-12 text-center">
          <div className="text-muted-light text-display-md mb-3">&#127866;</div>
          <p className="text-body-sm font-medium text-foreground">No venues yet</p>
          <p className="text-body-sm text-muted mt-1">Add your first venue above to start managing Happy Hours.</p>
        </div>
      )}
    </div>
  );

  // ════════════════════════════════════════════════════════════════════
  //  MENU PANEL  (organization-level shared menus)
  // ════════════════════════════════════════════════════════════════════
  const menuPanel = (
    <div>
      <PanelHeader title="Menus" desc="Organization-wide shared templates and each venue's own menus — all in one place." />

      <h3 className="text-body-md font-semibold text-foreground mb-1">Organization (shared) menus</h3>
      <p className="text-body-sm text-muted mb-4">Templates that venues can copy and customize locally.</p>

      {organizationMenusErr ? (
        <div className="rounded-md border border-error bg-error-light px-4 py-3 mb-5">
          <p className="text-body-sm font-medium text-error">Menus load error</p>
          <p className="text-body-sm text-error/80 mt-0.5">{organizationMenusErr.message}</p>
        </div>
      ) : null}

      {canManageOrganizationMenus ? (
        <form className="flex flex-col gap-3 sm:flex-row sm:items-end mb-6">
          <div className="flex-1">
            <label className="text-body-sm font-medium text-foreground block mb-1.5">New shared menu</label>
            <input name="menu_name" placeholder="e.g., Happy Hour Drinks" required className={inputCls} />
          </div>
          <SubmitButton formAction={createOrganizationMenu.bind(null, orgId)} className={btnPrimary + ' shrink-0'} pendingLabel="Adding...">
            Add shared menu
          </SubmitButton>
        </form>
      ) : null}

      {organizationMenuList.length ? (
        <div className="flex flex-col gap-6">
          {organizationMenuList.map((menu) => {
            const menuPublished = (menu.status ?? '').toLowerCase() === HH_STATUS_PUBLISHED;
            const menuStatusColor = menuPublished
              ? 'bg-success-light text-success'
              : 'bg-warning-light text-warning';
            const menuFormId = `org-menu-save-${menu.id}`;
            const publishFormId = `org-menu-publish-${menu.id}`;
            const deleteFormId = `org-menu-delete-${menu.id}`;
            const syncFormId = `org-menu-sync-${menu.id}`;

            return (
              <div key={menu.id} className="rounded-lg border border-border bg-background">
                {canManageOrganizationMenus ? (
                  <>
                    <form id={menuFormId} action={saveOrganizationMenu.bind(null, orgId)} />
                    <form id={publishFormId}>
                      <input type="hidden" name="menu_id" value={menu.id} />
                    </form>
                    <form id={deleteFormId}>
                      <input type="hidden" name="menu_id" value={menu.id} />
                    </form>
                    <form id={syncFormId}>
                      <input type="hidden" name="menu_id" value={menu.id} />
                    </form>
                    <input form={menuFormId} type="hidden" name="menu_id" value={menu.id} />
                  </>
                ) : null}

                <div className="p-5 border-b border-border">
                  {canManageOrganizationMenus ? (
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
                        <input
                          form={menuFormId}
                          name="menu_name"
                          defaultValue={menu.name}
                          required
                          className={inputCls + ' sm:max-w-xs'}
                        />
                        <label className="flex items-center gap-2 text-body-sm text-muted cursor-pointer">
                          <input
                            form={menuFormId}
                            type="checkbox"
                            name="menu_is_active"
                            defaultChecked={menu.is_active}
                            className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
                          />
                          Active
                        </label>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-caption font-medium ${menuStatusColor}`}>
                          {menuPublished ? 'Published' : 'Draft'}
                        </span>
                        <SubmitButton type="submit" form={menuFormId} className={btnSecondary} pendingLabel="Saving...">
                          Save
                        </SubmitButton>
                        <SubmitButton
                          className={btnSecondary}
                          form={syncFormId}
                          formAction={syncOrganizationMenuToVenues.bind(null, orgId)}
                          pendingLabel="Syncing..."
                        >
                          Sync copies
                        </SubmitButton>
                        {menuPublished ? (
                          <SubmitButton
                            className={btnPrimary}
                            form={publishFormId}
                            formAction={unpublishOrganizationMenu.bind(null, orgId)}
                            pendingLabel="Updating..."
                          >
                            Unpublish
                          </SubmitButton>
                        ) : (
                          <SubmitButton
                            className={btnPrimary}
                            form={publishFormId}
                            formAction={publishOrganizationMenu.bind(null, orgId)}
                            pendingLabel="Publishing..."
                          >
                            Publish
                          </SubmitButton>
                        )}
                        <SubmitButton
                          className={btnDanger}
                          form={deleteFormId}
                          formAction={deleteOrganizationMenu.bind(null, orgId)}
                          formNoValidate
                          pendingLabel="Deleting..."
                        >
                          Delete
                        </SubmitButton>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <h3 className="text-body-md font-semibold text-foreground">{menu.name}</h3>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-caption font-medium mt-1 ${menuStatusColor}`}>
                        {menuPublished ? 'Published' : 'Draft'}
                      </span>
                    </div>
                  )}
                </div>

                <div className="p-5">
                  {canManageOrganizationMenus ? (
                    <form className="flex flex-col gap-3 sm:flex-row sm:items-end mb-5">
                      <input type="hidden" name="menu_id" value={menu.id} />
                      <div className="flex-1">
                        <label className="text-caption font-medium text-muted block mb-1">New section</label>
                        <input name="section_name" placeholder="e.g., Cocktails" required className={inputCls} />
                      </div>
                      <SubmitButton
                        className={btnSecondary + ' shrink-0'}
                        formAction={createOrganizationMenuSection.bind(null, orgId)}
                        pendingLabel="Adding..."
                      >
                        Add section
                      </SubmitButton>
                    </form>
                  ) : null}

                  {(menu.menu_sections ?? []).length ? (
                    <div className="flex flex-col gap-5">
                      {(menu.menu_sections ?? []).map((section) => {
                        const deleteSectionFormId = `org-section-delete-${section.id}`;

                        return (
                          <div key={section.id} className="rounded-md border border-border bg-surface p-4">
                            {canManageOrganizationMenus ? (
                              <form id={deleteSectionFormId}>
                                <input type="hidden" name="section_id" value={section.id} />
                              </form>
                            ) : null}

                            {canManageOrganizationMenus ? (
                              <div className="flex items-center gap-3 mb-4">
                                <input form={menuFormId} type="hidden" name="section_ids" value={section.id} />
                                <input
                                  form={menuFormId}
                                  name={`section_name_${section.id}`}
                                  defaultValue={section.name}
                                  required
                                  className={inputCls + ' flex-1'}
                                />
                                <SubmitButton
                                  className={btnDanger}
                                  form={deleteSectionFormId}
                                  formAction={deleteOrganizationMenuSection.bind(null, orgId)}
                                  formNoValidate
                                  pendingLabel="Deleting..."
                                >
                                  Delete section
                                </SubmitButton>
                              </div>
                            ) : (
                              <h4 className="text-body-sm font-semibold text-foreground mb-4">{section.name}</h4>
                            )}

                            {(section.menu_items ?? []).length ? (
                              <div className="flex flex-col gap-3">
                                {(section.menu_items ?? []).map((item) => {
                                  const deleteItemFormId = `org-item-delete-${item.id}`;

                                  return (
                                    <div key={item.id} className="rounded-md border border-border bg-background p-4">
                                      {canManageOrganizationMenus ? (
                                        <form id={deleteItemFormId}>
                                          <input type="hidden" name="item_id" value={item.id} />
                                        </form>
                                      ) : null}
                                      {canManageOrganizationMenus ? (
                                        <div className="flex flex-col gap-3">
                                          <input form={menuFormId} type="hidden" name="item_ids" value={item.id} />
                                          <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-3">
                                            <input
                                              form={menuFormId}
                                              name={`item_name_${item.id}`}
                                              defaultValue={item.name}
                                              required
                                              className={inputCls}
                                            />
                                            <input
                                              form={menuFormId}
                                              name={`item_price_${item.id}`}
                                              type="number"
                                              step="0.01"
                                              defaultValue={item.price ?? ''}
                                              placeholder="Price"
                                              className={inputCls}
                                            />
                                          </div>
                                          <textarea
                                            form={menuFormId}
                                            name={`item_description_${item.id}`}
                                            defaultValue={item.description ?? ''}
                                            placeholder="Description (optional)"
                                            rows={2}
                                            className={inputCls + ' h-auto py-2'}
                                          />
                                          <div className="flex items-center justify-between gap-3">
                                            <label className="flex items-center gap-2 text-body-sm text-muted cursor-pointer">
                                              <input
                                                form={menuFormId}
                                                type="checkbox"
                                                name={`item_is_happy_hour_${item.id}`}
                                                defaultChecked={!!item.is_happy_hour}
                                                className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
                                              />
                                              Happy hour item
                                            </label>
                                            <SubmitButton
                                              className={btnDanger}
                                              form={deleteItemFormId}
                                              formAction={deleteOrganizationMenuItem.bind(null, orgId)}
                                              formNoValidate
                                              pendingLabel="Deleting..."
                                            >
                                              Delete item
                                            </SubmitButton>
                                          </div>
                                        </div>
                                      ) : (
                                        <div>
                                          <div className="flex items-center justify-between">
                                            <h5 className="text-body-sm font-semibold text-foreground">{item.name}</h5>
                                            {item.price != null ? (
                                              <span className="text-body-sm font-medium text-foreground">${Number(item.price).toFixed(2)}</span>
                                            ) : null}
                                          </div>
                                          <p className="text-caption text-muted mt-0.5">{item.description ?? 'No description'}</p>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <p className="text-caption text-muted text-center py-2">No items yet.</p>
                            )}

                            {canManageOrganizationMenus ? (
                              <MenuSectionItemAdder
                                sectionId={section.id}
                                createItemAction={createOrganizationMenuItem.bind(null, orgId)}
                                addButtonClassName={btnSecondary}
                                okButtonClassName={btnSecondary}
                                deleteButtonClassName={btnDanger}
                                inputClassName={inputCls}
                              />
                            ) : null}
                          </div>
                        );
                      })}
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
          <p className="text-body-sm font-medium text-foreground">No organization menus yet</p>
          <p className="text-body-sm text-muted mt-1">Create a shared menu here, then import it into any venue.</p>
        </div>
      )}

      {/* ── Per-venue menus — the same editor as each venue's page, so every
          saved menu (including the ones you attach to happy hour windows) lives
          here under the Menus tab. Edits post back to this tab. ── */}
      {venueRows.length ? (
        <div className="mt-10 flex flex-col gap-8">
          <div className="border-t border-border pt-8">
            <h3 className="text-body-md font-semibold text-foreground">Venue menus</h3>
            <p className="text-body-sm text-muted mt-0.5">
              Each venue&rsquo;s own menus — these are what you attach to happy hour windows.
            </p>
          </div>
          {venueRows.map((v) => {
            const venueMenus = venueMenusByVenue.get(v.id) ?? [];
            const importedOrganizationMenuIds = new Set(
              venueMenus.map((m) => m.source_menu_id).filter((id): id is string => !!id),
            );
            const publishedFromOtherVenues = allPublishedVenueMenus.filter((m) => m.venue_id !== v.id);
            const venueAddress = addressByVenue.get(v.id) ?? '';
            return (
              <VenueMenusManager
                key={v.id}
                title={v.name}
                description={venueAddress || 'Menus for this venue.'}
                menus={venueMenus}
                organizationMenuList={organizationMenuList.map((m) => ({
                  id: m.id,
                  name: m.name,
                  status: m.status,
                  is_active: m.is_active,
                }))}
                publishedVenueMenus={publishedFromOtherVenues}
                importedOrganizationMenuIds={importedOrganizationMenuIds}
                canManageVenue={canManageOrganizationMenus}
                canEditMenuItems={canManageOrganizationMenus}
                redirectTo={`/orgs/${orgId}`}
                classNames={{ input: inputCls, select: selectCls, btnPrimary, btnSecondary, btnDanger }}
                actions={{
                  createMenu: createMenu.bind(null, orgId, v.id),
                  importOrganizationMenu: importOrganizationMenu.bind(null, orgId, v.id),
                  importPublishedVenueMenu: importPublishedVenueMenu.bind(null, orgId, v.id),
                  saveMenu: saveMenu.bind(null, orgId, v.id),
                  publishMenu: publishMenu.bind(null, orgId, v.id),
                  unpublishMenu: unpublishMenu.bind(null, orgId, v.id),
                  deleteMenu: deleteMenu.bind(null, orgId, v.id),
                  createSection: createSection.bind(null, orgId, v.id),
                  deleteSection: deleteSection.bind(null, orgId, v.id),
                  createItem: createItem.bind(null, orgId, v.id),
                  deleteItem: deleteItem.bind(null, orgId, v.id),
                }}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );

  // ════════════════════════════════════════════════════════════════════
  //  HAPPY HOURS PANEL  (inline, org-wide window editor)
  //  Every venue's happy-hour windows are managed right here: expand a window
  //  to edit its schedule + attached menus, publish/unpublish, or delete it
  //  (with a toast confirm). Each window's editor reuses the per-venue happy-
  //  hour actions, but passes redirect_to=/orgs/{orgId} so saving lands back on
  //  this tab instead of bouncing to the standalone venue page. When the org has
  //  more than one venue, each group is labelled with its venue name + address.
  // ════════════════════════════════════════════════════════════════════
  const canManageHours = canManageOrganizationMenus;
  const isMultiVenue = venueRows.length > 1;
  const hoursReturnTo = `/orgs/${orgId}`;
  const hhStatusPill = (status: string | null) =>
    (status ?? '').toLowerCase() === HH_STATUS_PUBLISHED
      ? 'bg-success-light text-success'
      : 'bg-warning-light text-warning';

  const hoursPanel = (
    <div>
      <PanelHeader
        title="Happy Hours"
        desc="Edit windows, attach menus, publish, and delete — all without leaving this page."
      />
      {venueRows.length ? (
        <div className="flex flex-col gap-8">
          {venueRows.map((v) => {
            const windows = windowsByVenue.get(v.id) ?? [];
            const venueMenus = menusByVenue.get(v.id) ?? [];
            const venueAddress = addressByVenue.get(v.id) ?? '';
            const { kind, label: rollupLabel } = computeHoursStatus(windows);
            const rollupPill: Record<HHStatusKind, string> = {
              live: 'bg-success-light text-success',
              soon: 'bg-brand-subtle text-brand-dark-alt',
              scheduled: 'bg-background text-muted border border-border',
              draft: 'bg-warning-light text-warning',
              none: 'bg-warning-light text-warning',
            };

            return (
              <div key={v.id} className="flex flex-col gap-3">
                {/* Venue label — only when the org has multiple venues, so each
                    window is unambiguously tied to its location + address. */}
                {isMultiVenue ? (
                  <div className="flex items-center justify-between gap-3 px-1">
                    <div className="min-w-0">
                      <h3 className="text-body-md font-semibold text-foreground truncate">{v.name}</h3>
                      {venueAddress ? (
                        <p className="text-caption text-muted truncate">{venueAddress}</p>
                      ) : null}
                    </div>
                    {windows.length ? (
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption font-medium shrink-0 ${rollupPill[kind]}`}>
                        {kind === 'live' ? <span className="w-1.5 h-1.5 rounded-full bg-success" /> : null}
                        {rollupLabel}
                      </span>
                    ) : null}
                  </div>
                ) : null}

                {windows.length ? (
                  <div className="flex flex-col gap-3">
                    {windows.map((w) => {
                      const isPublished = (w.status ?? '').toLowerCase() === HH_STATUS_PUBLISHED;
                      const selectedMenus = menusByWindow.get(w.id) ?? new Set<string>();
                      const summary = (
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="w-10 h-10 rounded-md bg-brand-subtle flex items-center justify-center shrink-0">
                            <span className="text-heading-sm font-bold text-brand-dark">&#9200;</span>
                          </div>
                          <div className="min-w-0">
                            <div className="text-body-md font-semibold text-foreground truncate">
                              {hhFmtDays(w.dow) || 'No days set'}
                            </div>
                            <p className="text-body-sm text-muted truncate">
                              {hhFmtRange(w.start_time, w.end_time) || '—'}
                              {w.label ? <span className="text-muted-light"> · {w.label}</span> : null}
                            </p>
                            {/* When the org has several venues, name + address ride on
                                each window so it's never ambiguous which location it's for. */}
                            {isMultiVenue ? (
                              <p className="text-caption text-muted-light truncate">
                                {v.name}
                                {venueAddress ? ` · ${venueAddress}` : ''}
                              </p>
                            ) : null}
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-caption font-medium mt-1 ${hhStatusPill(w.status)}`}>
                              {isPublished ? 'Published' : 'Draft'}
                            </span>
                          </div>
                        </div>
                      );

                      return (
                        <Disclosure key={w.id} summary={summary}>
                          {canManageHours ? (
                            <div className="flex flex-col gap-5">
                              {/* ── Edit schedule ── */}
                              <form className="flex flex-col gap-4">
                                <input type="hidden" name="hh_id" value={w.id} />
                                <input type="hidden" name="redirect_to" value={hoursReturnTo} />
                                <div>
                                  <p className="text-caption font-medium text-muted mb-2">Days</p>
                                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                                    {DOW_LABELS.map((d, i) => (
                                      <label key={d} className="flex items-center gap-2 text-body-sm text-foreground cursor-pointer">
                                        <input
                                          type="checkbox"
                                          name="dow"
                                          value={i}
                                          defaultChecked={(w.dow ?? []).includes(i)}
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
                                    <input name="start_time" type="time" defaultValue={hhTimeForInput(w.start_time)} required className={inputCls} />
                                  </div>
                                  <div>
                                    <label className="text-caption font-medium text-muted block mb-1">End</label>
                                    <input name="end_time" type="time" defaultValue={hhTimeForInput(w.end_time)} required className={inputCls} />
                                  </div>
                                  <div className="col-span-2">
                                    <label className="text-caption font-medium text-muted block mb-1">Label (optional)</label>
                                    <input name="label" defaultValue={w.label ?? ''} placeholder="e.g., Late night, Brunch" className={inputCls} />
                                  </div>
                                </div>
                                <div>
                                  <SubmitButton formAction={updateHappyHour.bind(null, orgId, v.id)} className={btnSecondary} pendingLabel="Saving…">
                                    Save
                                  </SubmitButton>
                                </div>
                              </form>

                              {/* ── Menus to attach ── */}
                              <div className="border-t border-border pt-4">
                                <p className="text-body-sm font-medium text-foreground mb-2">Menus available in this window</p>
                                {venueMenus.length ? (
                                  <form action={updateHappyHourMenus.bind(null, orgId, v.id)} className="flex flex-col gap-3">
                                    <input type="hidden" name="hh_id" value={w.id} />
                                    <input type="hidden" name="redirect_to" value={hoursReturnTo} />
                                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                                      {venueMenus.map((menu) => (
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
                                      <SubmitButton type="submit" className={btnSecondary} pendingLabel="Saving…">
                                        Save menus
                                      </SubmitButton>
                                    </div>
                                  </form>
                                ) : (
                                  <p className="text-caption text-muted">
                                    No menus for this venue yet. Add one from the venue&rsquo;s Menu tab, then attach it here.
                                  </p>
                                )}
                              </div>

                              {/* ── Status + delete ── */}
                              <div className="border-t border-border pt-4 flex items-center gap-2">
                                <form>
                                  <input type="hidden" name="hh_id" value={w.id} />
                                  <input type="hidden" name="redirect_to" value={hoursReturnTo} />
                                  {isPublished ? (
                                    <SubmitButton className={btnSecondary} formAction={unpublishHappyHour.bind(null, orgId, v.id)} pendingLabel="Updating…">
                                      Unpublish
                                    </SubmitButton>
                                  ) : (
                                    <SubmitButton className={btnPrimary} formAction={publishHappyHour.bind(null, orgId, v.id)} pendingLabel="Publishing…">
                                      Publish
                                    </SubmitButton>
                                  )}
                                </form>
                                <ConfirmDeleteToast
                                  action={deleteHappyHour.bind(null, orgId, v.id)}
                                  hiddenFields={{ hh_id: w.id, redirect_to: hoursReturnTo }}
                                  message="Delete this happy hour window? This can't be undone."
                                  className={btnDanger}
                                >
                                  Delete
                                </ConfirmDeleteToast>
                              </div>
                            </div>
                          ) : (
                            <p className="text-body-sm text-muted">You don&rsquo;t have permission to edit this window.</p>
                          )}
                        </Disclosure>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border-strong bg-surface/50 p-8 text-center">
                    <div className="text-muted-light text-display-md mb-2">&#9200;</div>
                    <p className="text-body-sm font-medium text-foreground">No happy hour windows yet</p>
                    <p className="text-body-sm text-muted mt-1">Add your first window below to get started.</p>
                  </div>
                )}

                {/* ── Add a window ── */}
                {canManageHours ? (
                  <details className="rounded-lg border border-border bg-surface shadow-sm">
                    <summary className="flex items-center gap-2 p-4 cursor-pointer text-body-sm font-medium text-foreground select-none list-none">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-brand">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                      Add a window{isMultiVenue ? ` to ${v.name}` : ''}
                    </summary>
                    <form className="flex flex-col gap-4 border-t border-border p-5">
                      <input type="hidden" name="redirect_to" value={hoursReturnTo} />
                      <div>
                        <p className="text-caption font-medium text-muted mb-2">Days</p>
                        <div className="flex flex-wrap gap-x-4 gap-y-2">
                          {DOW_LABELS.map((d, i) => (
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
                        <SubmitButton formAction={addHappyHour.bind(null, orgId, v.id)} className={btnPrimary} pendingLabel="Adding…">
                          Add window (draft)
                        </SubmitButton>
                      </div>
                    </form>
                  </details>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border-strong bg-surface/50 p-12 text-center">
          <p className="text-body-sm font-medium text-foreground">No venues yet</p>
          <p className="text-body-sm text-muted mt-1">Add a venue first, then set its happy hour windows.</p>
        </div>
      )}
    </div>
  );

  // ════════════════════════════════════════════════════════════════════
  //  TEAM PANEL  (links to the existing access-management route)
  //  Members/invites live at /orgs/[orgId]/access. (See follow-up
  //  walkthrough for embedding it inline.)
  // ════════════════════════════════════════════════════════════════════
  const teamPanel = (
    <div>
      <PanelHeader title="Team" desc="Invite staff, assign roles, and control who can access each venue." />
      <AccessManager
        orgId={orgId}
        membershipRole={role}
        venueRows={venueRows}
        memberRows={memberRows}
        inviteRows={inviteRows}
        assignmentsByUser={assignmentsByUser}
        venueNameById={venueNameById}
      />
    </div>
  );

  // ════════════════════════════════════════════════════════════════════
  //  SETTINGS PANEL
  //  Name/slug → updateOrganization. Danger zone → deleteOrganization.
  //  Notification preferences are not yet backed (see follow-up walkthrough).
  // ════════════════════════════════════════════════════════════════════
  const orgPrefs = org as {
    notify_new_review?: boolean;
    notify_happy_hour_reminders?: boolean;
    notify_weekly_summary?: boolean;
  } | null;
  const NOTIFICATION_PREFS: { name: string; label: string; desc: string; on: boolean }[] = [
    { name: 'notify_new_review', label: 'New venue review', desc: 'Get an email when a customer leaves a review', on: orgPrefs?.notify_new_review ?? true },
    { name: 'notify_happy_hour_reminders', label: 'Happy hour reminders', desc: 'Reminder 15 min before each happy hour window', on: orgPrefs?.notify_happy_hour_reminders ?? false },
    { name: 'notify_weekly_summary', label: 'Weekly summary', desc: 'Performance summary every Monday morning', on: orgPrefs?.notify_weekly_summary ?? true },
  ];

  const settingsPanel = (
    <div className="flex flex-col gap-4 max-w-[540px]">
      <PanelHeader title="Settings" desc="Organization details, notifications, and account actions." />

      <div className="rounded-lg border border-border bg-surface p-6 shadow-sm flex flex-col gap-4">
        <h3 className="text-heading-sm font-semibold text-foreground">Organization details</h3>
        <form className="flex flex-col gap-4">
          <input type="hidden" name="redirect_to" value={`/orgs/${orgId}`} />
          <div>
            <label htmlFor="org-name" className="text-body-sm font-medium text-foreground block mb-1.5">
              Name
            </label>
            <input id="org-name" name="name" defaultValue={org?.name ?? ''} required className={inputCls} />
          </div>
          <div>
            <label htmlFor="org-slug" className="text-body-sm font-medium text-foreground block mb-1.5">
              Slug
            </label>
            <input id="org-slug" name="slug" defaultValue={(org as { slug?: string } | null)?.slug ?? ''} className={inputCls} />
            <p className="text-caption text-muted-light mt-1">Appears in public URLs: happitime.biz/orgs/slug</p>
          </div>
          <div className="flex gap-2.5">
            <SubmitButton formAction={updateOrganization.bind(null, orgId)} className={btnPrimary} pendingLabel="Saving...">
              Save changes
            </SubmitButton>
          </div>
        </form>
      </div>

      <form className="rounded-lg border border-border bg-surface p-6 shadow-sm">
        <h3 className="text-heading-sm font-semibold text-foreground">Notifications</h3>
        <p className="text-body-sm text-muted mt-0.5 mb-3">
          Choose what events trigger an email to the organization owner.
        </p>
        {NOTIFICATION_PREFS.map(({ name, label, desc, on }) => (
          <div key={name} className="flex items-center justify-between py-2.5 border-b border-border last:border-b-0">
            <div>
              <div className="text-body-sm font-medium text-foreground">{label}</div>
              <div className="text-caption text-muted mt-0.5">{desc}</div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input type="checkbox" name={name} defaultChecked={on} className="sr-only peer" />
              <span className="block w-9 h-5 rounded-full bg-border peer-checked:bg-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand peer-focus-visible:ring-offset-1 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:rounded-full after:bg-white after:shadow-sm after:transition-all peer-checked:after:translate-x-4" />
            </label>
          </div>
        ))}
        <div className="mt-4">
          <SubmitButton formAction={saveOrgNotificationPrefs.bind(null, orgId)} className={btnPrimary} pendingLabel="Saving...">
            Save preferences
          </SubmitButton>
        </div>
      </form>

      <div className="rounded-lg border border-error/30 bg-error-light p-5">
        <div className="text-body-md font-semibold text-error">Danger zone</div>
        <div className="text-body-sm text-error/80 mt-1 mb-4">
          Permanently delete this organization, all its venues, and associated data. This cannot be undone.
        </div>
        <ConfirmDeleteForm
          action={deleteOrganization.bind(null, orgId)}
          message="Permanently delete this organization, all its venues, and associated data? This cannot be undone."
        >
          <button type="submit" className="inline-flex items-center justify-center h-9 px-4 rounded-md bg-error text-white text-body-sm font-medium hover:bg-[#b03535] transition-colors cursor-pointer">
            Delete organization
          </button>
        </ConfirmDeleteForm>
      </div>
    </div>
  );

  // ── assemble tabs ──
  const tabs: ShellTab[] = [
    { id: 'venues', label: 'Venues', content: venuesPanel },
    { id: 'hours', label: 'Happy Hours', content: hoursPanel },
    { id: 'menu', label: 'Menus', content: menuPanel },
    { id: 'team', label: 'Team', content: teamPanel, show: canManageAccess },
    { id: 'settings', label: 'Settings', content: settingsPanel, show: isOwner },
  ];

  const errorBanner = pageError ? (
    <div className="rounded-md border border-error bg-error-light px-4 py-3 mb-6">
      <p className="text-body-sm font-medium text-error">Error</p>
      <p className="text-body-sm text-error/80 mt-0.5">{pageError}</p>
    </div>
  ) : null;

  const displayRole = role || (fromAdmin && userIsAdmin ? 'admin' : 'member');

  return (
    <div className="bg-background">
      <UserBar />
      <Suspense>
        <FlashMessage />
      </Suspense>
      <VenueDashboardShell
        org={{
          id: orgId,
          name: orgErr ? 'Organization' : org?.name ?? 'Organization',
          role: displayRole,
          venueCount,
        }}
        tabs={tabs}
        banner={errorBanner}
      />
    </div>
  );
}
