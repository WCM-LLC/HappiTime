/**
 * Self-serve menu intake — the app's client for the console's /api/intake/*
 * routes. Unlike the rest of the app (which talks to Supabase and edge
 * functions directly), intake reuses the console's routes: the vision call and
 * the menu/window write are ~400 lines of already-reviewed server logic, and
 * forking them into an edge function would mean maintaining that twice.
 *
 * Auth is the user's Supabase access token as a bearer header — the console
 * accepts either that or its own cookie session.
 */
import Constants from "expo-constants";
import { supabase } from "./supabaseClient";

const extra = (Constants.expoConfig?.extra as Record<string, unknown> | undefined) ?? {};

const CONSOLE_URL = (
  process.env.EXPO_PUBLIC_CONSOLE_URL ??
  (extra.consoleUrl as string | undefined) ??
  "https://happitime-console.vercel.app"
).replace(/\/$/, "");

export type IntakeTier = "admin" | "owner" | "super_user";

export type IntakeSession = {
  tier: IntakeTier | null;
  enabled: boolean;
  daily_cap?: number | null;
  scans_remaining?: number | null;
};

export type IntakeVenue = {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
};

export type ExtractedWindow = {
  dow: number[];
  start_time: string;
  end_time: string;
  label?: string | null;
};

export type ExistingWindow = {
  id: string;
  dow: number[];
  start_time: string;
  end_time: string;
  label: string | null;
};

export type ExtractedItem = {
  name: string;
  price?: number | null;
  description?: string | null;
};

export type ExtractedSection = { name: string; items: ExtractedItem[] };

/** What the photo turned out to be. A human confirms this before commit. */
export type ContentType = "happy_hour" | "event" | "event_series" | "mixed" | "unknown";

export type ProposedEvent = {
  title: string;
  description?: string | null;
  event_type?: "event" | "special" | "live_music" | "trivia" | "sports" | "other" | null;
  /** YYYY-MM-DD for a one-off; null when it recurs. */
  date?: string | null;
  start_time: string;
  end_time?: string | null;
  is_recurring?: boolean;
  /** Weekdays it repeats on, 0=Sunday. The SERVER turns this into an RRULE. */
  recurrence_dow?: number[];
  price_info?: string | null;
};

export type ExtractedDraft = {
  content_type?: ContentType;
  windows: ExtractedWindow[];
  menu: { name: string; sections: ExtractedSection[] };
  events?: ProposedEvent[];
  _confidence?: "high" | "medium" | "low";
  _notes?: string;
};

export type CommitResult = {
  ok: boolean;
  published?: boolean;
  drafted?: boolean;
  in_review?: boolean;
  review_route?: "owner" | "admin" | null;
  content_type?: ContentType;
  event_ids?: string[];
  /** Titles the server could not place on a calendar. Must be shown, not dropped. */
  unschedulable_events?: string[];
  venue_id: string;
  menu_id: string | null;
};

/** Human-readable failure with the server's error code kept for branching. */
export class IntakeError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const FRIENDLY: Record<string, string> = {
  unauthorized: "Please sign in again.",
  forbidden: "Your account can't scan menus yet.",
  forbidden_venue: "You can't update that venue.",
  daily_limit_reached: "You've used all your menu scans for today. Try again tomorrow.",
  image_too_large: "That photo is too big — try taking it again.",
  unsupported_image_type: "That image format isn't supported.",
  extract_failed: "We couldn't read that photo. Try a straighter, brighter shot.",
  invalid_payload: "Something in the menu didn't look right. Check the fields and retry.",
  service_role_missing: "Menu scanning is misconfigured. Please tell us about this.",
};

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new IntakeError("unauthorized", 401, FRIENDLY.unauthorized);
  return { Authorization: `Bearer ${token}` };
}

async function parseOrThrow(res: Response): Promise<any> {
  const json = await res.json().catch(() => null);
  if (res.ok) return json;
  const code = (json?.error as string | undefined) ?? "request_failed";
  const detail = (json?.detail as string | undefined) ?? FRIENDLY[code];
  throw new IntakeError(code, res.status, detail ?? "Something went wrong. Please try again.");
}

/** What this user may do with intake, and how many scans are left today. */
export async function fetchIntakeSession(): Promise<IntakeSession> {
  const res = await fetch(`${CONSOLE_URL}/api/intake/session`, {
    headers: await authHeader(),
  });
  return (await parseOrThrow(res)) as IntakeSession;
}

/** Venue search, already scoped to what this tier may edit. */
export async function searchIntakeVenues(q: string): Promise<IntakeVenue[]> {
  if (q.trim().length < 2) return [];
  const res = await fetch(
    `${CONSOLE_URL}/api/intake/venues?q=${encodeURIComponent(q.trim())}`,
    { headers: await authHeader() },
  );
  const json = await parseOrThrow(res);
  return (json?.venues ?? []) as IntakeVenue[];
}

/**
 * Per-venue scan context: the windows already on the venue (so a scan attaches
 * instead of duplicating) and whether this caller's commit publishes or queues
 * for approval. Both are venue-scoped — an org editor and an org owner share
 * the same tier but not the same publish right.
 */
export async function fetchVenueScanContext(
  venueId: string,
): Promise<{ windows: ExistingWindow[]; canPublish: boolean }> {
  const res = await fetch(
    `${CONSOLE_URL}/api/intake/windows?venue_id=${encodeURIComponent(venueId)}`,
    { headers: await authHeader() },
  );
  const json = await parseOrThrow(res);
  return {
    windows: (json?.windows ?? []) as ExistingWindow[],
    canPublish: Boolean(json?.can_publish),
  };
}

/**
 * Matches an extracted window to an existing one on (day set, start, end) —
 * the same rule the console's capture page uses. Without this every scan would
 * insert a fresh window, because /api/intake/commit inserts new_windows[]
 * without deduping, and a venue's listing would grow a duplicate happy hour
 * on the owner's very first scan.
 */
export function findMatchingWindow(
  ex: ExtractedWindow,
  existing: ExistingWindow[],
): ExistingWindow | null {
  const key = (dow: number[], start: string, end: string) =>
    `${[...dow].sort((a, b) => a - b).join(",")}|${start.slice(0, 5)}|${end.slice(0, 5)}`;
  const target = key(ex.dow, ex.start_time, ex.end_time);
  return existing.find((e) => key(e.dow, e.start_time, e.end_time) === target) ?? null;
}

/**
 * Uploads the photo and returns the vision model's draft.
 *
 * The file is appended in React Native's { uri, name, type } form on purpose:
 * fetch(uri).blob() returns an EMPTY body in RN (the same trap that shipped
 * 0-byte avatars before useAvatarUpload switched to base64).
 */
export async function extractMenuFromPhoto(params: {
  uri: string;
  mimeType?: string;
  venueName?: string;
}): Promise<{ draft: ExtractedDraft; contentType: ContentType; ok: boolean; errors: string[] }> {
  const form = new FormData();
  form.append("image", {
    uri: params.uri,
    name: "menu.jpg",
    type: params.mimeType ?? "image/jpeg",
  } as unknown as Blob);
  if (params.venueName) form.append("venue_name", params.venueName);

  const res = await fetch(`${CONSOLE_URL}/api/intake/extract`, {
    method: "POST",
    headers: await authHeader(), // no Content-Type: RN sets the multipart boundary
    body: form,
  });
  const json = await parseOrThrow(res);
  return {
    draft: json.draft as ExtractedDraft,
    // The server normalizes an unrecognized label to "unknown" — the review
    // step asks the human either way, so this is a starting position only.
    contentType: (json?.content_type ?? "unknown") as ContentType,
    ok: Boolean(json.ok),
    errors: (json?.validation?.errors ?? []) as string[],
  };
}

/**
 * Writes the reviewed content. Two things stay the server's call regardless of
 * what this client sends: whether it publishes or queues for approval, and
 * whether the payload is even allowed for this venue. The client's job is to
 * carry the human's confirmed content_type, not to decide anything.
 */
export async function commitMenu(params: {
  venueId: string;
  /** The type a HUMAN confirmed, not the model's proposal. */
  contentType: ContentType;
  windowIds: string[];
  newWindows: ExtractedWindow[];
  menu: { name: string; sections: ExtractedSection[] };
  events?: ProposedEvent[];
  saveAsDraft?: boolean;
}): Promise<CommitResult> {
  const res = await fetch(`${CONSOLE_URL}/api/intake/commit`, {
    method: "POST",
    headers: { ...(await authHeader()), "Content-Type": "application/json" },
    body: JSON.stringify({
      venue_id: params.venueId,
      content_type: params.contentType,
      window_ids: params.windowIds,
      new_windows: params.newWindows,
      menu: params.menu,
      events: params.events ?? [],
      save_as_draft: Boolean(params.saveAsDraft),
      send_owner_confirmation: false,
    }),
  });
  return (await parseOrThrow(res)) as CommitResult;
}
