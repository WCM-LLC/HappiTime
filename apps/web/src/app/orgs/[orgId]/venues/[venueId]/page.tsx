import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import UserBar from '@/components/layout/UserBar';
import VenueMenusManager from '@/components/venue/VenueMenusManager';
import VenueDashboardShell, { type ShellTab, OrgMark, ShellCrumb } from '@/components/venue/VenueDashboardShell';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { FlashMessage } from '@/components/FlashMessage';
import VenueMediaUploader from '@/components/VenueMediaUploader';
import RewardConfig from './RewardConfig';
import type { SubscriptionPlan } from '@/utils/stripe';
import { PLAN_LABEL } from '@/utils/subscription-features';
import { createClient, createServiceClient } from '@/utils/supabase/server';
import { isAdminEmail } from '@/utils/admin-emails';
import { loginPathFor } from '@/utils/auth-paths';
import { fetchVenueById, type VenueDetail } from '@happitime/shared-api';
import { SIZE_PRESETS } from '@happitime/venue-qr';
import { VenueScanAnalytics } from '@/components/VenueScanAnalytics';
import { ToastmakerCard } from '@/components/ToastmakerCard';
import { summarizeScans, computeWindows, type ScanSummary, type ScanEvent } from '@/utils/scan-analytics';
import { serviceDate, generateCheckinCode } from '@happitime/shared-api/checkin-code';
import {
  updateVenue,
  publishVenue,
  unpublishVenue,
  updateVenueRatingSettings,
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
  deleteMenu,
  publishMenu,
  unpublishMenu,
  createSection,
  deleteSection,
  createItem,
  deleteItem,
  reverifyListing,
  resolveListingReport,
} from '../../../../../actions/venue-actions';
import {
  createEvent,
  updateEvent,
  deleteEvent,
  publishEvent,
  unpublishEvent,
  updateVenueTags,
} from '../../../../../actions/event-actions';
import {
  adminAddStaffMember,
  adminRemoveStaffMember,
} from '../../../../../actions/admin-staff-actions';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Verification loop: a listing older than this is shown as stale (matches the consumer app). */
const LISTING_STALE_AFTER_DAYS = 45;

const LISTING_REPORT_LABELS: Record<string, string> = {
  hours_wrong: 'Hours are wrong',
  menu_or_price_wrong: 'Menu or prices are wrong',
  deal_not_honored: "Deal wasn't honored",
};
const RATING_ASPECT_OPTIONS = ["food_quality", "service", "drink_selection", "ambiance", "value"];

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
  source_menu_id: string | null;
  menu_sections: MenuSection[] | null;
};

type PublishedVenueMenuOption = {
  id: string;
  name: string;
  venue_id: string | null;
  venue: {
    id: string;
    name: string;
    org_name: string | null;
  } | null;
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

  const VENUE_ERROR_MESSAGES: Record<string, string> = {
    not_authorized: "You don't have permission to make that change.",
    venue_not_found: "We couldn't find that venue.",
    venue_update_failed: 'Saving venue details failed. Try again.',
    venue_publish_failed: 'Publishing the venue failed.',
    venue_unpublish_failed: 'Unpublishing the venue failed.',
    missing_venue_name: 'Venue name is required.',
    cuisine_update_failed: 'Updating the cuisine type failed.',
    tags_update_failed: 'Updating venue tags failed.',
    happyhour_create_failed: 'Creating that happy hour window failed.',
    happyhour_update_failed: 'Updating that happy hour window failed.',
    happyhour_delete_failed: 'Deleting that happy hour window failed.',
    happyhour_publish_failed: 'Publishing that happy hour window failed.',
    happyhour_unpublish_failed: 'Unpublishing that happy hour window failed.',
    happyhour_menus_update_failed: 'Updating which menus run during this happy hour failed.',
    happyhour_not_found: "We couldn't find that happy hour window.",
    missing_dow: 'Pick at least one day of the week.',
    missing_time: 'Start and end times are required.',
    menu_create_failed: 'Creating the menu failed.',
    menu_update_failed: 'Updating the menu failed.',
    menu_delete_failed: 'Deleting the menu failed.',
    menu_publish_failed: 'Publishing the menu failed.',
    menu_unpublish_failed: 'Unpublishing the menu failed.',
    missing_organization_menu_id: 'Choose an organization menu to add.',
    organization_menu_not_found: "We couldn't find that organization menu.",
    organization_menu_import_failed: 'Adding that organization menu to this venue failed.',
    missing_source_menu_id: 'Choose a published menu to copy.',
    source_menu_not_found: "We couldn't find that published menu.",
    published_menu_import_failed: 'Copying that published menu failed.',
    missing_menu_name: 'Menu name is required.',
    section_create_failed: 'Creating the menu section failed.',
    section_update_failed: 'Updating the menu section failed.',
    section_delete_failed: 'Deleting the menu section failed.',
    item_create_failed: 'Creating the menu item failed.',
    item_update_failed: 'Updating the menu item failed.',
    item_delete_failed: 'Deleting the menu item failed.',
    missing_item_fields: 'Item name and price are required.',
    event_create_failed: 'Creating the event failed.',
    event_update_failed: 'Updating the event failed.',
    event_delete_failed: 'Deleting the event failed.',
    event_publish_failed: 'Publishing the event failed.',
    event_unpublish_failed: 'Unpublishing the event failed.',
    missing_event_title: 'Event title is required.',
    missing_event_date: 'Event start date is required.',
    listing_reverify_failed: 'Re-verifying the listing failed. Try again.',
    report_resolve_failed: 'Resolving that report failed. Try again.',
    missing_report_id: "We couldn't find that report.",
  };
  const errorText = pageError ? (VENUE_ERROR_MESSAGES[pageError] ?? pageError) : null;

  const authClient = await createClient();
  const { data: auth } = await authClient.auth.getUser();
  const user = auth.user;

  if (!user) {
    redirect(loginPathFor(`/orgs/${orgId}/venues/${venueId}`));
  }

  const userIsAdmin = await isAdminEmail(user.email);
  // Admins always read via service role so cross-org reads bypass RLS.
  // (RLS on writes is now handled by the platform_admin override policies.)
  const supabase = userIsAdmin ? createServiceClient() : await createClient();

  const { data: membership } = await (await createClient())
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle();

  const role = String(membership?.role ?? '');
  // Admin users always get full management access regardless of how they navigated
  // (used to require ?from=admin in the URL — that bug caused the misleading
  //  "editing requires manager access" message after a successful save).
  const isOwner = role === 'owner' || userIsAdmin;
  const isManager = role === 'manager' || role === 'admin' || role === 'editor';
  const isHost = role === 'host';
  const canManageVenue = isOwner || isManager || userIsAdmin;
  const canEditMenuItems = canManageVenue || isHost;

  // ── Stage 1 ─ every read that depends only on the URL params + role flags runs
  //  in parallel. These used to be ~12 sequential awaits (a request waterfall);
  //  batching collapses the venue page from ~15 DB round-trips to 2. A faster
  //  render also shrinks the streaming window a flaky client connection can cut
  //  mid-flight. supabase-js resolves { data, error } (it never rejects on a query
  //  error), so Promise.all is safe and the per-query error handling is unchanged.
  type StaffMember = { user_id: string; role: string; email: string | null; first_name: string | null; last_name: string | null };
  type VenueMemberRow = { user_id: string };

  const [
    { data: venue, error: venueErr },
    { data: qrVenue },
    { data: checkinSecretRow },
    { data: happyHours, error: hhErr },
    { data: menus, error: menusErr },
    { data: organizationMenus, error: organizationMenusErr },
    { data: publishedVenueMenusData, error: publishedVenueMenusErr },
    { data: eventCounts },
    { data: venueEvents },
    { data: approvedTags },
    { data: currentVenueTags },
    { data: venueSub },
    { staffMembers, venueStaffIds },
  ] = await Promise.all([
    fetchVenueById(supabase as any, venueId, { orgId }),
    // fetchVenueById does not select `slug`; fetch it for the QR download caption.
    // last_confirmed_at / listing_disputed power the listing-freshness banner.
    // (supabase as any): listing_disputed lands in generated types on next typegen.
    (supabase as any).from('venues').select('slug,last_confirmed_at,listing_disputed,reward_preset,reward_active').eq('id', venueId).maybeSingle(),
    // Read checkin_secret via service-role (always) — it is never sent to the
    // browser; only the derived 4-char code is shown in the sub-bar.
    // Gated to canManageVenue so hosts/viewers don't trigger a service-role read.
    canManageVenue
      ? createServiceClient()
          .from('venues')
          .select('checkin_secret')
          .eq('id', venueId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from('happy_hour_windows')
      .select('id,dow,start_time,end_time,timezone,status,label')
      .eq('venue_id', venueId)
      .order('start_time', { ascending: true }),
    supabase
      .from('menus')
      .select(
        'id,name,status,is_active,source_menu_id,menu_sections(id,name,sort_order,menu_items(id,name,description,price,is_happy_hour,sort_order))'
      )
      .eq('venue_id', venueId)
      .eq('scope', 'venue')
      .order('created_at', { ascending: false }),
    supabase
      .from('menus')
      .select('id,name,status,is_active')
      .eq('org_id', orgId)
      .eq('scope', 'organization')
      .order('name', { ascending: true }),
    // Published menus from OTHER venues — the "copy from another venue" source list.
    // Owners/admins read via their own client; service role broadens visibility for
    // assigned managers. Gated to canManageVenue (otherwise empty, no query issued).
    (async (): Promise<{ data: PublishedVenueMenuOption[]; error: { message: string } | null }> => {
      if (!canManageVenue) return { data: [], error: null };
      let sourceMenuClient = supabase;
      try {
        sourceMenuClient = createServiceClient();
      } catch {
        // The request client is enough for owners/admins; service role broadens source visibility for assigned managers.
      }
      const { data, error } = await sourceMenuClient
        .from('menus')
        .select('id,name,venue_id,venue:venues!menus_venue_id_fkey(id,name,org_name)')
        .eq('org_id', orgId)
        .eq('scope', 'venue')
        .eq('status', HH_STATUS_PUBLISHED)
        .neq('venue_id', venueId)
        .order('name', { ascending: true });
      return { data: (data as PublishedVenueMenuOption[] | null) ?? [], error };
    })(),
    supabase
      .from('venue_event_counts')
      .select('event_type,cnt')
      .eq('org_id', orgId)
      .eq('venue_id', venueId)
      .order('cnt', { ascending: false })
      .limit(20),
    supabase
      .from('venue_events')
      .select('id,title,description,event_type,status,starts_at,ends_at,is_recurring,recurrence_rule,timezone,price_info,external_url,ticket_url,capacity,location_override')
      .eq('venue_id', venueId)
      .order('starts_at', { ascending: true }),
    supabase
      .from('approved_tags')
      .select('id,slug,label,category,sort_order')
      .eq('is_active', true)
      .order('category')
      .order('sort_order'),
    supabase.from('venue_tags').select('tag_id').eq('venue_id', venueId),
    (supabase as any)
      .from('venue_subscriptions')
      .select('plan, status')
      .eq('venue_id', venueId)
      .maybeSingle(),
    // Staff roster (admin-only view): two service-role reads, run together.
    (async (): Promise<{ staffMembers: StaffMember[]; venueStaffIds: Set<string> }> => {
      if (!(fromAdmin && userIsAdmin)) return { staffMembers: [], venueStaffIds: new Set() };
      const adminDb = createServiceClient();
      const [{ data: orgStaff }, { data: venueAssignments }] = await Promise.all([
        adminDb
          .from('org_members')
          .select('user_id,role,email,first_name,last_name')
          .eq('org_id', orgId)
          .order('created_at', { ascending: true }),
        adminDb.from('venue_members').select('user_id').eq('venue_id', venueId),
      ]);
      return {
        staffMembers: (orgStaff as StaffMember[] | null) ?? [],
        venueStaffIds: new Set((venueAssignments as VenueMemberRow[] | null)?.map((a) => a.user_id) ?? []),
      };
    })(),
  ]);

  const qrSlug = (qrVenue?.slug as string | null) ?? null;

  // ── Listing freshness (verification loop) ──────────────────────────────────
  const listingLastConfirmedAt = (qrVenue?.last_confirmed_at as string | null) ?? null;
  const listingDisputed = (qrVenue?.listing_disputed as boolean | null) === true;
  const listingAgeDays = listingLastConfirmedAt
    ? Math.floor((Date.now() - new Date(listingLastConfirmedAt).getTime()) / 86_400_000)
    : null;
  const listingStale = listingAgeDays === null || listingAgeDays > LISTING_STALE_AFTER_DAYS;
  const publishedVenueMenus: PublishedVenueMenuOption[] = publishedVenueMenusData ?? [];

  const currentPlan: SubscriptionPlan =
    venueSub?.status === 'active' || venueSub?.status === 'trialing'
      ? ((['verified', 'featured', 'founding_pilot'].includes(venueSub.plan) ? venueSub.plan : 'listed') as SubscriptionPlan)
      : 'listed';

  // ── Stage 2 ─ reads that depend on Stage 1: scanSummary needs the venue's
  //  timezone; windowMenus needs the happy-hour window ids. Independent of each
  //  other, so run them together.
  const happyHourIds = (happyHours as HappyHourWindow[] | null)?.map((h) => h.id) ?? [];
  // Scan activity for venue staff (owner/manager/admin/editor/host).
  // venue_attribution_events is RLS-locked, so read with the service client —
  // gated by the app-level canEditMenuItems check (the only authorization needed).
  const scanWindows =
    canEditMenuItems && venue ? computeWindows(venue?.timezone ?? 'UTC', new Date()) : null;

  // 90-day window for check-in stats (covers yesterday / 7d / 30d).
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 3600_000).toISOString();

  const [scanSummary, { windowMenus, windowMenusErr }, checkinStats, openReports] = await Promise.all([
    (async (): Promise<ScanSummary | null> => {
      if (!scanWindows) return null;
      const svc = createServiceClient();
      const { data: scanEvents } = await svc
        .from('venue_attribution_events')
        .select('source, created_at, user_id')
        .eq('venue_id', venueId)
        .gte('created_at', scanWindows.monthStart)
        .order('created_at', { ascending: false });

      // Resolve handles for authenticated scanners (check-ins). QR/push/organic are
      // anonymous (user_id null) and stay handle-less. Read via service role — the
      // page is already gated by canEditMenuItems, and user_profiles is RLS-locked.
      const scannerIds = [
        ...new Set(
          ((scanEvents ?? []) as { user_id: string | null }[])
            .map((e) => e.user_id)
            .filter((id): id is string => !!id),
        ),
      ];
      const profileById = new Map<string, { handle: string | null; display_name: string | null }>();
      if (scannerIds.length) {
        const { data: profiles } = await svc
          .from('user_profiles')
          .select('user_id, handle, display_name')
          .in('user_id', scannerIds);
        for (const p of (profiles ?? []) as { user_id: string; handle: string | null; display_name: string | null }[]) {
          profileById.set(p.user_id, { handle: p.handle, display_name: p.display_name });
        }
      }

      const enriched: ScanEvent[] = ((scanEvents ?? []) as {
        source: string;
        created_at: string;
        user_id: string | null;
      }[]).map((e) => {
        const prof = e.user_id ? profileById.get(e.user_id) : undefined;
        return {
          source: e.source,
          created_at: e.created_at,
          user_id: e.user_id,
          handle: prof?.handle ?? null,
          display_name: prof?.display_name ?? null,
        };
      });
      return summarizeScans(enriched, scanWindows);
    })(),
    (async (): Promise<{ windowMenus: HappyHourWindowMenu[]; windowMenusErr: { message: string } | null }> => {
      if (!happyHourIds.length) return { windowMenus: [], windowMenusErr: null };
      const { data: hhMenus, error: hhMenusErr } = await supabase
        .from('happy_hour_window_menus')
        .select('happy_hour_window_id,menu_id')
        .in('happy_hour_window_id', happyHourIds);
      return {
        windowMenus: (hhMenus as HappyHourWindowMenu[] | null) ?? [],
        windowMenusErr: hhMenusErr,
      };
    })(),
    // Check-in stats (canManageVenue): read via service-role (checkins is RLS-locked).
    (async () => {
      if (!canManageVenue) {
        return { checkins: [], redemptions: [], flags: [] };
      }
      const svcStats = createServiceClient();
      const [{ data: ciRows }, { data: rdRows }, { data: flRows }] = await Promise.all([
        svcStats
          .from('checkins')
          .select('id,user_id,method,service_date,created_at')
          .eq('venue_id', venueId)
          .gte('created_at', ninetyDaysAgo)
          .order('created_at', { ascending: false }),
        svcStats
          .from('round_redemptions')
          .select('id,created_at')
          .eq('venue_id', venueId)
          .gte('created_at', ninetyDaysAgo),
        svcStats
          .from('venue_flags')
          .select('id,flag_type,resolved_at,created_at')
          .eq('venue_id', venueId)
          .gte('created_at', ninetyDaysAgo),
      ]);
      return {
        checkins: (ciRows ?? []) as { id: string; user_id: string; method: string; service_date: string; created_at: string }[],
        redemptions: (rdRows ?? []) as { id: string; created_at: string }[],
        flags: (flRows ?? []) as { id: string; flag_type: string; resolved_at: string | null; created_at: string }[],
      };
    })(),
    // Open consumer listing reports ("Something's off" in the app). RLS-locked
    // table; read via service role, gated by canManageVenue like checkinStats.
    (async (): Promise<{ id: string; report_type: string; note: string | null; created_at: string }[]> => {
      if (!canManageVenue) return [];
      const { data: reportRows } = await (createServiceClient() as any)
        .from('listing_reports')
        .select('id,report_type,note,created_at')
        .eq('venue_id', venueId)
        .eq('status', 'open')
        .order('created_at', { ascending: false });
      return (reportRows ?? []) as { id: string; report_type: string; note: string | null; created_at: string }[];
    })(),
  ]);

  const v = venue;
  const menuList = (menus as Menu[] | null) ?? [];
  const organizationMenuList =
    (organizationMenus as Pick<Menu, 'id' | 'name' | 'status' | 'is_active'>[] | null) ?? [];
  const importedOrganizationMenuIds = new Set(
    menuList.map((menu) => menu.source_menu_id).filter((id): id is string => !!id),
  );
  const menuSelections = new Map<string, Set<string>>();

  for (const link of windowMenus) {
    if (!menuSelections.has(link.happy_hour_window_id)) {
      menuSelections.set(link.happy_hour_window_id, new Set());
    }
    menuSelections.get(link.happy_hour_window_id)?.add(link.menu_id);
  }
  // ── Check-in stats ────────────────────────────────────────────────────────
  const { checkins: ciRows, redemptions: rdRows, flags: flRows } = checkinStats;

  // Time boundaries (UTC)
  const nowMs = Date.now();
  const yesterday = new Date(nowMs - 24 * 3600_000).toISOString();
  const sevenDaysAgo = new Date(nowMs - 7 * 24 * 3600_000).toISOString();
  const thirtyDaysAgo = new Date(nowMs - 30 * 24 * 3600_000).toISOString();

  const ciYesterday = ciRows.filter((r) => r.created_at >= yesterday).length;
  const ci7d = ciRows.filter((r) => r.created_at >= sevenDaysAgo).length;
  const ci30d = ciRows.filter((r) => r.created_at >= thirtyDaysAgo).length;

  // First-timers vs returning: defined for rows with a user_id (identified).
  // Anonymous GPS-fallback rows (user_id present but anon) are counted as anonymous.
  // We compute "first-timer" as user_ids whose earliest check-in at this venue
  // is within the 30-day window.
  const allUserIds = [...new Set(ciRows.map((r) => r.user_id).filter(Boolean))];
  // For the 30-day window: first checkin per user across all 90d data
  const firstCheckinDateByUser = new Map<string, string>();
  for (const r of [...ciRows].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if (r.user_id && !firstCheckinDateByUser.has(r.user_id)) {
      firstCheckinDateByUser.set(r.user_id, r.created_at);
    }
  }
  const ci30dRows = ciRows.filter((r) => r.created_at >= thirtyDaysAgo);
  const firstTimers30d = ci30dRows.filter((r) => {
    const first = r.user_id ? firstCheckinDateByUser.get(r.user_id) : null;
    return first && first >= thirtyDaysAgo;
  }).length;
  const returning30d = ci30dRows.filter((r) => {
    const first = r.user_id ? firstCheckinDateByUser.get(r.user_id) : null;
    return first && first < thirtyDaysAgo;
  }).length;

  const gpsCount30d = ci30dRows.filter((r) => r.method === 'gps_fallback').length;
  const redemptions30d = rdRows.filter((r) => r.created_at >= thirtyDaysAgo).length;
  const openFlags = flRows.filter((r) => !r.resolved_at).length;

  // ── Today's check-in code (canManageVenue only; secret never leaves server) ──
  const checkinSecret = (checkinSecretRow as { checkin_secret: string } | null)?.checkin_secret ?? null;
  const todayCheckinCode = canManageVenue && checkinSecret
    ? generateCheckinCode(checkinSecret, serviceDate(new Date()))
    : null;

  const previewHref = `/app-preview/orgs/${orgId}/venues/${venueId}`;
  const displayName = v?.org_name?.trim() || v?.name || 'Venue';
  const locationLabel = v?.org_name?.trim() && v.org_name !== v?.name ? v.name : null;
  const backHref = fromAdmin ? `/orgs/${orgId}?from=admin` : `/orgs/${orgId}`;
  const venuePublished = (v?.status ?? '').toLowerCase() === HH_STATUS_PUBLISHED;
  const venueStatusColor = venuePublished
    ? 'bg-success-light text-success'
    : 'bg-warning-light text-warning';

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

  const subBarLeft = (
    <div className="flex items-center gap-3 min-w-0">
      <OrgMark name={displayName} />
      <div className="min-w-0">
        <ShellCrumb
          items={[
            { label: fromAdmin ? 'Admin' : 'Dashboard', href: fromAdmin ? '/admin' : '/dashboard' },
            { label: 'Organization', href: backHref },
            { label: displayName },
          ]}
        />
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[16px] font-bold text-foreground tracking-[-0.3px] truncate">
            {displayName}
          </span>
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-caption font-medium shrink-0 ${venueStatusColor}`}>
            {venuePublished ? 'Published' : 'Draft'}
          </span>
          <span className="text-body-sm text-muted hidden sm:inline shrink-0">
            {locationLabel ? `${locationLabel} · ` : ''}
            {v?.city || v?.state ? `${v?.city ?? ''}${v?.city && v?.state ? ', ' : ''}${v?.state ?? ''}` : '—'}
          </span>
        </div>
      </div>
    </div>
  );
  const subBarRight = (
    <>
            {/* Today's check-in code — computed server-side; secret never reaches browser */}
            {todayCheckinCode ? (
              <div
                title="Today's check-in code (rotates at 6 AM CT)"
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-brand/30 bg-brand-subtle shrink-0"
              >
                <span className="text-caption font-medium text-muted-light hidden sm:inline">Code</span>
                <span className="font-mono text-[15px] font-bold tracking-[0.15em] text-brand-dark-alt">
                  {todayCheckinCode}
                </span>
              </div>
            ) : null}
            {canManageVenue ? (
              <form className="flex items-center gap-2">
                {venuePublished ? (
                  <SubmitButton className={btnSecondary} formAction={unpublishVenue.bind(null, orgId, venueId)} pendingLabel="Updating…">
                    Unpublish
                  </SubmitButton>
                ) : (
                  <SubmitButton className={btnPrimary} formAction={publishVenue.bind(null, orgId, venueId)} pendingLabel="Publishing…">
                    Publish
                  </SubmitButton>
                )}
              </form>
            ) : null}
            <Link href={previewHref} target="_blank" rel="noopener noreferrer">
              <span className={btnDark}>Preview in App</span>
            </Link>
            {canManageVenue && (
              <Link href={`/orgs/${orgId}/venues/${venueId}/subscription`}>
                <span className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-md border text-body-sm font-medium transition-colors cursor-pointer ${
                  currentPlan === 'founding_pilot' ? 'border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100' :
                  currentPlan === 'featured' ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100' :
                  currentPlan === 'verified' ? 'border-brand/30 bg-brand-subtle text-brand-dark-alt hover:bg-brand-subtle/80' :
                  'border-border bg-surface text-muted hover:bg-background'
                }`}>
                  <span className={`inline-block h-2 w-2 rounded-full ${
                    currentPlan === 'listed' ? 'bg-muted-light' : 'bg-current'
                  }`} />
                  {PLAN_LABEL[currentPlan]}
                </span>
              </Link>
            )}
            {fromAdmin ? (
              <Link href="/admin">
                <span className={btnSecondary}>Return to console</span>
              </Link>
            ) : null}
            <Link href={backHref}>
              <span className={btnSecondary}>&larr; Back</span>
            </Link>
    </>
  );

  const banner = (
    <>
        {[
          errorText && { title: 'Error', msg: errorText },
          venueErr && { title: 'Venue load error', msg: venueErr.message },
          hhErr && { title: 'Happy hour load error', msg: hhErr.message },
          menusErr && { title: 'Menus load error', msg: menusErr.message },
          organizationMenusErr && { title: 'Organization menus load error', msg: organizationMenusErr.message },
          publishedVenueMenusErr && { title: 'Published menu library load error', msg: publishedVenueMenusErr.message },
          windowMenusErr && { title: 'Menu mapping error', msg: windowMenusErr.message },
        ]
          .filter(Boolean)
          .map((e, i) => (
            <div key={i} className="rounded-md border border-error bg-error-light px-4 py-3 mb-4">
              <p className="text-body-sm font-medium text-error">{(e as { title: string }).title}</p>
              <p className="text-body-sm text-error/80 mt-0.5">{(e as { msg: string }).msg}</p>
            </div>
          ))}

        {/* ── Listing freshness (verification loop) ──
            Quiet when healthy; amber when stale (>45d) or consumer-disputed.
            "Confirm" stamps last_confirmed_at — the DB trigger clears the dispute. */}
        {canManageVenue && (listingStale || listingDisputed || openReports.length > 0) ? (
          <div className="rounded-md border border-warning bg-warning-light px-4 py-3 mb-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-body-sm font-medium text-foreground">
                  {listingDisputed
                    ? 'App users reported this listing may be out of date'
                    : openReports.length > 0
                    ? 'An app user reported a problem with this listing'
                    : 'Is your listing still accurate?'}
                </p>
                <p className="text-body-sm text-muted mt-0.5">
                  Last verified {listingAgeDays === null ? 'never' : listingAgeDays === 0 ? 'today' : `${listingAgeDays} days ago`}.
                  {' '}Fresh listings rank higher in the app — confirming takes one tap.
                </p>
              </div>
              <form className="shrink-0">
                <SubmitButton
                  className="inline-flex items-center justify-center h-9 px-4 rounded-md bg-brand text-white text-body-sm font-medium hover:bg-brand-dark transition-colors cursor-pointer"
                  formAction={reverifyListing.bind(null, orgId, venueId)}
                  pendingLabel="Confirming…"
                >
                  Still accurate ✓
                </SubmitButton>
              </form>
            </div>

            {openReports.length > 0 ? (
              <div className="border-t border-warning/30 mt-3 pt-3 flex flex-col gap-2">
                {openReports.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3">
                    <p className="text-body-sm text-foreground min-w-0">
                      <span className="font-medium">{LISTING_REPORT_LABELS[r.report_type] ?? r.report_type}</span>
                      {r.note ? <span className="text-muted"> — “{r.note}”</span> : null}
                      <span className="text-muted-light"> · {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    </p>
                    <div className="flex items-center gap-2 shrink-0">
                      <form>
                        <input type="hidden" name="report_id" value={r.id} />
                        <input type="hidden" name="resolution" value="confirmed" />
                        <SubmitButton className={btnSecondary} formAction={resolveListingReport.bind(null, orgId, venueId)} pendingLabel="Saving…">
                          Fixed it
                        </SubmitButton>
                      </form>
                      <form>
                        <input type="hidden" name="report_id" value={r.id} />
                        <input type="hidden" name="resolution" value="rejected" />
                        <SubmitButton className={btnSecondary} formAction={resolveListingReport.bind(null, orgId, venueId)} pendingLabel="Saving…">
                          Listing is correct
                        </SubmitButton>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
    </>
  );

  const detailsPart1 = (
    <>
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

            <div>
              <label htmlFor="vi-phone" className="text-body-sm font-medium text-foreground block mb-1.5">Phone</label>
              <input id="vi-phone" name="phone" type="tel" placeholder="+1 (555) 000-0000" defaultValue={v?.phone ?? ''} readOnly={!canManageVenue} className={inputCls} />
            </div>

            <div>
              <label htmlFor="vi-website" className="text-body-sm font-medium text-foreground block mb-1.5">Website</label>
              <input id="vi-website" name="website" type="url" placeholder="https://example.com" defaultValue={v?.website ?? ''} readOnly={!canManageVenue} className={inputCls} />
            </div>

            <div>
              <p className="text-body-sm font-medium text-foreground mb-2">Social media</p>
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-body-sm text-muted w-24 shrink-0">Facebook</span>
                  <input name="facebook_url" type="url" placeholder="https://facebook.com/yourvenue" defaultValue={v?.facebook_url ?? ''} readOnly={!canManageVenue} className={inputCls} />
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-body-sm text-muted w-24 shrink-0">Instagram</span>
                  <input name="instagram_url" type="url" placeholder="https://instagram.com/yourvenue" defaultValue={v?.instagram_url ?? ''} readOnly={!canManageVenue} className={inputCls} />
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-body-sm text-muted w-24 shrink-0">TikTok</span>
                  <input name="tiktok_url" type="url" placeholder="https://tiktok.com/@yourvenue" defaultValue={v?.tiktok_url ?? ''} readOnly={!canManageVenue} className={inputCls} />
                </div>
              </div>
            </div>

            {canManageVenue ? (
              <div>
                <SubmitButton formAction={updateVenue.bind(null, orgId, venueId)} className={btnPrimary} pendingLabel="Saving…">
                  Save changes
                </SubmitButton>
              </div>
            ) : (
              <p className="text-caption text-muted">You can view venue details, but editing requires manager access.</p>
            )}
          </form>
        </div>



        <div className="rounded-lg border border-border bg-surface p-6 shadow-sm mb-8">
          <div className="mb-5">
            <h2 className="text-heading-sm font-semibold text-foreground">Post-visit ratings</h2>
            <p className="text-body-sm text-muted mt-0.5">Configure rating prompts and selectable aspects.</p>
          </div>

          <form className="flex flex-col gap-4">
            <label className="inline-flex items-center gap-2 text-body-sm text-foreground">
              <input type="checkbox" name="post_visit_rating_enabled" defaultChecked={(v as any)?.post_visit_rating_enabled !== false} disabled={!canManageVenue} />
              Enable post-visit rating prompts
            </label>
            <div>
              <p className="text-body-sm font-medium text-foreground mb-2">Rating aspects</p>
              <div className="flex flex-wrap gap-3">
                {RATING_ASPECT_OPTIONS.map((aspect) => {
                  const selected = ((v as any)?.post_visit_rating_aspects ?? []).includes(aspect);
                  return (
                    <label key={aspect} className="inline-flex items-center gap-2 text-body-sm text-muted">
                      <input type="checkbox" name="rating_aspects" value={aspect} defaultChecked={selected} disabled={!canManageVenue} />
                      {aspect.replaceAll('_', ' ')}
                    </label>
                  );
                })}
              </div>
            </div>
            {canManageVenue ? (
              <div>
                <SubmitButton formAction={updateVenueRatingSettings.bind(null, orgId, venueId)} className={btnPrimary} pendingLabel="Saving…">
                  Save rating settings
                </SubmitButton>
              </div>
            ) : null}
          </form>
        </div>
    </>
  );

  const happyHoursPanel = (
    <>
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
                            <SubmitButton className={btnSecondary} formAction={unpublishHappyHour.bind(null, orgId, venueId)} pendingLabel="Updating…">
                              Unpublish
                            </SubmitButton>
                          ) : (
                            <SubmitButton className={btnPrimary} formAction={publishHappyHour.bind(null, orgId, venueId)} pendingLabel="Publishing…">
                              Publish
                            </SubmitButton>
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
                              <SubmitButton className={btnSecondary} formAction={updateHappyHour.bind(null, orgId, venueId)} pendingLabel="Saving…">
                                Save
                              </SubmitButton>
                              <SubmitButton className={btnDanger} formAction={deleteHappyHour.bind(null, orgId, venueId)} pendingLabel="Deleting…">
                                Delete
                              </SubmitButton>
                            </div>
                          </form>
                        </div>

                        {/* ── Menu associations ── */}
                        <div className="border-t border-border mt-4 pt-4">
                          <p className="text-body-sm font-medium text-foreground mb-2">Menus available in this window</p>
                          {menuList.length ? (
                            <form
                              action={updateHappyHourMenus.bind(null, orgId, venueId)}
                              className="flex flex-col gap-3"
                            >
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
                                <SubmitButton type="submit" className={btnSecondary} pendingLabel="Saving…">
                                  Save menus
                                </SubmitButton>
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
                  <SubmitButton formAction={addHappyHour.bind(null, orgId, venueId)} className={btnPrimary} pendingLabel="Adding…">
                    Add window (draft)
                  </SubmitButton>
                </div>
              </form>
            </div>
          ) : null}
        </div>
    </>
  );

  const menusPanel = (
    <>
        <VenueMenusManager
          menus={menuList}
          organizationMenuList={organizationMenuList}
          publishedVenueMenus={publishedVenueMenus}
          importedOrganizationMenuIds={importedOrganizationMenuIds}
          canManageVenue={canManageVenue}
          canEditMenuItems={canEditMenuItems}
          classNames={{ input: inputCls, select: selectCls, btnPrimary, btnSecondary, btnDanger }}
          actions={{
            createMenu: createMenu.bind(null, orgId, venueId),
            importOrganizationMenu: importOrganizationMenu.bind(null, orgId, venueId),
            importPublishedVenueMenu: importPublishedVenueMenu.bind(null, orgId, venueId),
            saveMenu: saveMenu.bind(null, orgId, venueId),
            publishMenu: publishMenu.bind(null, orgId, venueId),
            unpublishMenu: unpublishMenu.bind(null, orgId, venueId),
            deleteMenu: deleteMenu.bind(null, orgId, venueId),
            createSection: createSection.bind(null, orgId, venueId),
            deleteSection: deleteSection.bind(null, orgId, venueId),
            createItem: createItem.bind(null, orgId, venueId),
            deleteItem: deleteItem.bind(null, orgId, venueId),
          }}
        />
    </>
  );

  const tagsPanel = (
    <>
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
                <SubmitButton formAction={updateVenueTags.bind(null, orgId, venueId)} className={btnPrimary} pendingLabel="Saving…">
                  Save tags
                </SubmitButton>
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
    </>
  );

  const eventsPanel = (
    <>
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
                            <SubmitButton className={btnSecondary} formAction={unpublishEvent.bind(null, orgId, venueId)} pendingLabel="Updating…">
                              Unpublish
                            </SubmitButton>
                          ) : (
                            <SubmitButton className={btnPrimary} formAction={publishEvent.bind(null, orgId, venueId)} pendingLabel="Publishing…">
                              Publish
                            </SubmitButton>
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
                            <SubmitButton className={btnSecondary} formAction={updateEvent.bind(null, orgId, venueId)} pendingLabel="Saving…">
                              Save
                            </SubmitButton>
                            <SubmitButton className={btnDanger} formAction={deleteEvent.bind(null, orgId, venueId)} pendingLabel="Deleting…">
                              Delete
                            </SubmitButton>
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
                  <SubmitButton formAction={createEvent.bind(null, orgId, venueId)} className={btnPrimary} pendingLabel="Adding…">
                    Add event (draft)
                  </SubmitButton>
                </div>
              </form>
            </div>
          ) : null}
        </div>
    </>
  );

  const mediaQrPanel = (
    <>
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
            SECTION 4A — QR CODE
        ══════════════════════════════════════════════ */}
        {canManageVenue && qrSlug ? (
          <div className="rounded-lg border border-border bg-surface p-6 shadow-sm mb-8">
            <div className="mb-5">
              <h2 className="text-heading-sm font-semibold text-foreground">QR code</h2>
              <p className="text-body-sm text-muted mt-0.5">
                Scannable code for your venue. Download, print, and place it in your building.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(SIZE_PRESETS).map(([key, preset]) => (
                <a
                  key={key}
                  href={`/api/orgs/${orgId}/venues/${venueId}/qr?size=${key}`}
                  download
                  className={btnSecondary}
                >
                  {preset.label}
                  {preset.inches ? ` (${preset.inches}")` : ''}
                </a>
              ))}
            </div>
            <p className="text-caption text-muted mt-3">
              Links to happitime.biz/v/{qrSlug}?src=qr
            </p>
            {v?.status !== 'published' ? (
              <p className="text-caption text-warning mt-1">
                QR becomes scannable once the venue is published.
              </p>
            ) : null}
          </div>
        ) : null}
    </>
  );

  const staffPanel = (
    <>
        {fromAdmin && userIsAdmin ? (
          <div className="rounded-lg border border-border bg-surface p-6 shadow-sm mb-8">
            <div className="mb-5">
              <h2 className="text-heading-sm font-semibold text-foreground">Staff</h2>
              <p className="text-body-sm text-muted mt-0.5">
                Manage owners, managers, and hosts for this venue. Adding someone here creates their login and grants access immediately.
              </p>
            </div>

            {/* Current staff */}
            {staffMembers.length ? (
              <div className="flex flex-col gap-3 mb-6">
                {staffMembers.map((member) => {
                  const label = [member.first_name, member.last_name].filter(Boolean).join(' ') || member.email || member.user_id;
                  const isAssigned = venueStaffIds.has(member.user_id);
                  const roleBadgeColor =
                    member.role === 'owner'
                      ? 'bg-brand-subtle text-brand-dark'
                      : member.role === 'manager' || member.role === 'admin' || member.role === 'editor'
                        ? 'bg-success-light text-success'
                        : 'bg-background text-muted';
                  return (
                    <div key={member.user_id} className="rounded-lg border border-border bg-background p-4 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-brand-subtle flex items-center justify-center shrink-0">
                          <span className="text-body-sm font-bold text-brand-dark">
                            {label.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="text-body-sm font-semibold text-foreground">{label}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-caption font-medium ${roleBadgeColor}`}>
                              {member.role}
                            </span>
                            {member.email ? <span className="text-caption text-muted">{member.email}</span> : null}
                            {isAssigned ? (
                              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-caption font-medium bg-success-light text-success">
                                Assigned to this venue
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-caption font-medium bg-background text-muted-light border border-border">
                                Org member only
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {member.role !== 'owner' ? (
                        <form>
                          <input type="hidden" name="user_id" value={member.user_id} />
                          <input type="hidden" name="return_path" value={`/orgs/${orgId}/venues/${venueId}?from=admin`} />
                          <button
                            formAction={adminRemoveStaffMember.bind(null, orgId)}
                            className={btnDanger}
                          >
                            Remove
                          </button>
                        </form>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border-strong bg-background/50 p-8 text-center mb-6">
                <div className="text-muted-light text-display-md mb-2">&#128101;</div>
                <p className="text-body-sm font-medium text-foreground">No staff members yet</p>
                <p className="text-body-sm text-muted mt-1">Add owners, managers, or hosts below.</p>
              </div>
            )}

            {/* Add staff form */}
            <div className="border-t border-border pt-6">
              <p className="text-body-sm font-medium text-foreground mb-3">Add a staff member</p>
              <form className="flex flex-col gap-4">
                <input type="hidden" name="return_path" value={`/orgs/${orgId}/venues/${venueId}?from=admin`} />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-caption font-medium text-muted block mb-1">First name</label>
                    <input name="first_name" placeholder="Jane" required className={inputCls} />
                  </div>
                  <div>
                    <label className="text-caption font-medium text-muted block mb-1">Last name</label>
                    <input name="last_name" placeholder="Doe" required className={inputCls} />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-caption font-medium text-muted block mb-1">Email</label>
                    <input name="email" type="email" placeholder="user@example.com" required className={inputCls} />
                  </div>
                  <div>
                    <label className="text-caption font-medium text-muted block mb-1">Password</label>
                    <input name="password" type="text" placeholder="Min 8 characters" required minLength={8} className={inputCls} />
                  </div>
                  <div>
                    <label className="text-caption font-medium text-muted block mb-1">Role</label>
                    <select name="role" defaultValue="manager" className={selectCls}>
                      <option value="owner">Owner</option>
                      <option value="manager">Manager</option>
                      <option value="host">Host</option>
                    </select>
                  </div>
                </div>

                <div>
                  <p className="text-caption font-medium text-muted mb-2">Assign to venues</p>
                  <label className="flex items-center gap-2 text-body-sm text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      name="venue_ids"
                      value={venueId}
                      defaultChecked
                      className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
                    />
                    This venue ({displayName})
                  </label>
                </div>

                <div>
                  <button
                    formAction={adminAddStaffMember.bind(null, orgId)}
                    className={btnPrimary}
                  >
                    Add staff member
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}
    </>
  );

  const analyticsPanel = (
    <>
        {/* Per-scan attribution log — QR scans, check-ins, opens (handle shown for check-ins). */}
        {canEditMenuItems && scanSummary ? (
          <VenueScanAnalytics summary={scanSummary} />
        ) : null}
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
    </>
  );

  const checkinPanel = (
    <>
        <div className="rounded-lg border border-border bg-surface p-6 shadow-sm mb-8">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-heading-sm font-semibold text-foreground">Check-ins</h2>
              <p className="text-body-sm text-muted mt-0.5">
                App check-ins and GPS-fallback arrivals at this venue.
              </p>
            </div>
            <a
              href={`/api/venues/${venueId}/checkins-export`}
              download
              className="inline-flex items-center justify-center h-9 px-4 rounded-md border border-border bg-surface text-body-sm font-medium text-foreground hover:bg-background transition-colors cursor-pointer shrink-0"
            >
              Export CSV
            </a>
          </div>

          {/* ── Window counts ── */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[
              { label: 'Yesterday', value: ciYesterday },
              { label: 'Last 7 days', value: ci7d },
              { label: 'Last 30 days', value: ci30d },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-md border border-border bg-background p-4 text-center">
                <p className="text-display-sm font-bold text-foreground tabular-nums">{value}</p>
                <p className="text-caption text-muted mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* ── 30-day breakdown ── */}
          <div className="rounded-md border border-border overflow-hidden mb-6">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-background">
                  <th className="text-left text-caption font-medium text-muted px-4 py-2.5">Metric (last 30 days)</th>
                  <th className="text-right text-caption font-medium text-muted px-4 py-2.5">Count</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: 'First-timers (identified)', value: firstTimers30d },
                  { label: 'Returning (identified)', value: returning30d },
                  { label: 'GPS fallback (no code)', value: gpsCount30d },
                  { label: 'Rounds redeemed', value: redemptions30d },
                  { label: 'Open staff flags', value: openFlags },
                ].map((row, i) => (
                  <tr key={row.label} className={`border-b border-border last:border-b-0 ${i % 2 === 0 ? 'bg-surface' : 'bg-background/50'}`}>
                    <td className="text-body-sm text-foreground px-4 py-2.5">{row.label}</td>
                    <td className="text-body-sm text-muted text-right tabular-nums px-4 py-2.5">{row.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Anonymous note ── */}
          <p className="text-caption text-muted">
            First-timer / returning counts apply only to identified (app) check-ins.
            Anonymous GPS-fallback check-ins are counted separately above.
          </p>
        </div>
    </>
  );

  const toastmakerPanel = canManageVenue ? (
    <ToastmakerCard venueId={venueId} />
  ) : null;

  const rewardPanel = canManageVenue ? (
    <RewardConfig
      orgId={orgId}
      venueId={venueId}
      initialPreset={(qrVenue as { reward_preset?: string | null } | null)?.reward_preset ?? null}
      initialActive={Boolean((qrVenue as { reward_active?: boolean | null } | null)?.reward_active)}
    />
  ) : null;

  const tabs: ShellTab[] = [
    { id: 'details', label: 'Details', content: <>{detailsPart1}{tagsPanel}</> },
    { id: 'happy-hours', label: 'Happy Hours', content: happyHoursPanel },
    { id: 'menus', label: 'Menus', content: menusPanel },
    { id: 'events', label: 'Events', content: eventsPanel },
    { id: 'media', label: 'Media & QR', content: mediaQrPanel, show: canManageVenue },
    { id: 'checkins', label: 'Check-ins', content: checkinPanel, show: canManageVenue },
    { id: 'rewards', label: 'Rewards', content: rewardPanel, show: canManageVenue },
    { id: 'toastmaker', label: 'Toastmaker', content: toastmakerPanel, show: canManageVenue },
    { id: 'staff', label: 'Staff', content: staffPanel, show: fromAdmin && userIsAdmin },
    { id: 'analytics', label: 'Analytics', content: analyticsPanel },
  ];

  return (
    <div className="bg-background">
      <UserBar />
      <Suspense>
        <FlashMessage />
      </Suspense>
      <VenueDashboardShell
        storeKey={`hh-venue-detail:${venueId}`}
        tabs={tabs}
        banner={banner}
        subBarLeft={subBarLeft}
        subBarRight={subBarRight}
      />
    </div>
  );
}
