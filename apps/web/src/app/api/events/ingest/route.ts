import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

type EventIn = {
  org_id: string;
  venue_id: string;
  user_id?: string | null;
  event_type: string;
  meta?: any;
  occurred_at?: string;
};

type RateBucket = {
  count: number;
  resetAt: number;
};

const rateBuckets = new Map<string, RateBucket>();

function getClientId(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? 'unknown';
  return request.headers.get('x-real-ip') ?? 'unknown';
}

function isRateLimited(clientId: string, limit: number): boolean {
  const now = Date.now();
  const windowMs = 60_000;
  const bucket = rateBuckets.get(clientId);

  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(clientId, { count: 1, resetAt: now + windowMs });
    return false;
  }

  bucket.count += 1;
  return bucket.count > limit;
}

function toStringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isValidIsoDate(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

export async function POST(request: Request) {
  const apiKey = request.headers.get('x-api-key');
  if (process.env.EVENTS_INGEST_API_KEY && apiKey !== process.env.EVENTS_INGEST_API_KEY) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const rateLimit = Number(process.env.EVENTS_INGEST_RATE_LIMIT_PER_MIN ?? '0');
  if (rateLimit > 0 && isRateLimited(getClientId(request), rateLimit)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as EventIn[] | EventIn | null;
  if (!body) return NextResponse.json({ error: 'invalid_json' }, { status: 400 });

  const events = Array.isArray(body) ? body : [body];
  if (events.length === 0) {
    return NextResponse.json({ error: 'empty_payload' }, { status: 400 });
  }

  const maxBatch = Number(process.env.EVENTS_INGEST_MAX_BATCH ?? '0');
  if (maxBatch > 0 && events.length > maxBatch) {
    return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 });
  }

  const supabase = createAdminClient(url, serviceKey, { auth: { persistSession: false } });

  const now = new Date().toISOString();
  const payload = events.map((event) => {
    const org_id = toStringValue((event as any)?.org_id);
    const venue_id = toStringValue((event as any)?.venue_id);
    const event_type = toStringValue((event as any)?.event_type);

    if (!org_id || !venue_id || !event_type) {
      return null;
    }

    const userRaw = toStringValue((event as any)?.user_id ?? '');
    const occurredAtRaw = toStringValue((event as any)?.occurred_at ?? '');
    const metaRaw = (event as any)?.meta;

    return {
      org_id,
      venue_id,
      user_id: userRaw || null,
      event_type,
      meta: isPlainObject(metaRaw) ? metaRaw : {},
      occurred_at: occurredAtRaw && isValidIsoDate(occurredAtRaw) ? occurredAtRaw : now,
    };
  });

  if (payload.some((item) => item === null)) {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
  }

  const sanitized = payload as EventIn[];
  const { error } = await supabase.from('events').insert(sanitized);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, inserted: sanitized.length });
}
