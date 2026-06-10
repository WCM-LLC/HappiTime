/**
 * Zero-login staff page: /staff/[staff_token]
 *
 * No user authentication required. The staff_token is a per-venue UUID that
 * acts as a shared secret for staff access. It is NOT the HMAC key.
 *
 * Security model:
 *   - staff_token is a URL parameter (not a query string secret) so it may
 *     appear in server logs. It provides access only to today's 4-char code,
 *     not to the underlying HMAC key (checkin_secret).
 *   - checkin_secret is read server-side via the service-role client and is
 *     NEVER passed to the client component or included in the page payload.
 *   - The client component receives only { code, rotatesAt, venueName }.
 *
 * The page is force-dynamic (no caching) so the code is always fresh and
 * the rotatesAt countdown is accurate on every load.
 */

import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { serviceDate, generateCheckinCode } from '@happitime/shared-api/checkin-code';
import { StaffCodeDisplay } from './StaffCodeDisplay';
import type { Metadata } from 'next';

// Always render fresh — the code rotates daily and the countdown must be live.
export const dynamic = 'force-dynamic';

// ── service-role client (server-only) ─────────────────────────────────────────
function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment',
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Compute the ISO timestamp of the next 6:00 AM America/Chicago rotation.
 * Mirrors the logic in the web app's checkin-code API route.
 */
function nextRotatesAt(now: Date): string {
  const ctParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(now);

  const get = (t: string) =>
    Number(ctParts.find((p) => p.type === t)?.value ?? '0');

  const ctHour = get('hour');
  const ctMinute = get('minute');
  const ctSecond = get('second');

  const secsSince6am = (ctHour - 6) * 3600 + ctMinute * 60 + ctSecond;
  const msUntilNext =
    secsSince6am >= 0
      ? 86_400_000 - secsSince6am * 1_000
      : -secsSince6am * 1_000;

  return new Date(now.getTime() + msUntilNext).toISOString();
}

type Props = {
  params: Promise<{ staff_token: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { staff_token } = await params;
  const svc = getServiceClient();
  const { data: venue } = await svc
    .from('venues')
    .select('name')
    .eq('staff_token', staff_token)
    .maybeSingle();

  if (!venue) {
    return { title: 'Staff Check-in — HappiTime', robots: { index: false } };
  }

  return {
    title: `${venue.name} — Staff Check-in Code`,
    description: `Today's check-in code for ${venue.name} staff.`,
    robots: { index: false, follow: false },
  };
}

export default async function StaffCheckinPage({ params }: Props) {
  const { staff_token } = await params;

  // ── Read venue by staff_token via service-role (no user auth required) ─────
  // We read checkin_secret here (server only) and NEVER pass it to the client.
  const svc = getServiceClient();
  const { data: venue, error } = await svc
    .from('venues')
    .select('id, name, checkin_secret')
    .eq('staff_token', staff_token)
    .maybeSingle();

  if (error || !venue) {
    notFound();
  }

  // ── Compute today's code server-side ──────────────────────────────────────
  const now = new Date();
  const svcDate = serviceDate(now);
  // checkin_secret is a uuid string — used as the HMAC key.
  const code = generateCheckinCode(venue.checkin_secret as string, svcDate);
  const rotatesAt = nextRotatesAt(now);

  // Pass only the derived code and metadata to the client — never the secret.
  return (
    <StaffCodeDisplay
      initialCode={code}
      rotatesAt={rotatesAt}
      venueName={venue.name as string}
    />
  );
}
