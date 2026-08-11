import { NextRequest, NextResponse } from 'next/server';
import { canUsePlacesProxy, getPlacesKey } from '@/utils/places-gate';
import {
  buildStreetAddress,
  getCity,
  getState,
  getZip,
  normalizePart,
  type PlacesAddressComponent,
} from '@/utils/places-parse';

export const runtime = 'nodejs';

const FIELD_MASK =
  'id,displayName,formattedAddress,addressComponents,location,nationalPhoneNumber,websiteUri,businessStatus';

export type VenuePrefill = {
  placeId: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  lat: number | null;
  lng: number | null;
  phone: string;
  website: string;
  businessStatus: string | null;
};

// Per-serverless-instance TTL cache (not shared across lambdas — accepted
// tradeoff; the win is repeat lookups within a warm instance, e.g. an admin
// double-checking a suggestion). Details of a just-created venue never need
// refetching, so 24h is generous.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 200;
const detailsCache = new Map<string, { at: number; prefill: VenuePrefill }>();

function cacheGet(placeId: string): VenuePrefill | null {
  const hit = detailsCache.get(placeId);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    detailsCache.delete(placeId);
    return null;
  }
  return hit.prefill;
}

function cacheSet(placeId: string, prefill: VenuePrefill) {
  if (detailsCache.size >= CACHE_MAX) {
    const oldest = detailsCache.keys().next().value;
    if (oldest) detailsCache.delete(oldest);
  }
  detailsCache.set(placeId, { at: Date.now(), prefill });
}

export async function POST(req: NextRequest) {
  try {
    if (!(await canUsePlacesProxy())) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const key = getPlacesKey();
    if (!key) {
      return NextResponse.json({ error: 'Places API not configured' }, { status: 500 });
    }

    const body = await req.json().catch(() => null);
    const placeId = typeof body?.placeId === 'string' ? body.placeId.trim() : '';
    const sessionToken = typeof body?.sessionToken === 'string' ? body.sessionToken : '';
    if (!placeId) {
      return NextResponse.json({ error: 'Missing placeId' }, { status: 400 });
    }

    const cached = cacheGet(placeId);
    if (cached) return NextResponse.json({ prefill: cached, cached: true });

    const url = new URL(`https://places.googleapis.com/v1/places/${placeId}`);
    // The details call closes the Autocomplete billing session.
    if (sessionToken) url.searchParams.set('sessionToken', sessionToken);

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': FIELD_MASK,
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('[places/details]', res.status, text.slice(0, 300));
      return NextResponse.json({ error: 'Details lookup failed' }, { status: 502 });
    }

    const data = await res.json().catch(() => null);
    const components = (data?.addressComponents ?? []) as PlacesAddressComponent[];
    const prefill: VenuePrefill = {
      placeId,
      name: normalizePart(data?.displayName?.text ?? ''),
      address: buildStreetAddress(components),
      city: getCity(components),
      state: getState(components),
      zip: getZip(components),
      lat: typeof data?.location?.latitude === 'number' ? data.location.latitude : null,
      lng: typeof data?.location?.longitude === 'number' ? data.location.longitude : null,
      phone: normalizePart(data?.nationalPhoneNumber ?? ''),
      website: normalizePart(data?.websiteUri ?? ''),
      businessStatus: typeof data?.businessStatus === 'string' ? data.businessStatus : null,
    };

    cacheSet(placeId, prefill);
    return NextResponse.json({ prefill });
  } catch (err) {
    console.error('[places/details]', err);
    return NextResponse.json({ error: 'Details lookup failed' }, { status: 500 });
  }
}
