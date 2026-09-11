import { NextRequest, NextResponse } from 'next/server';
import { canUsePlacesProxy, getPlacesKey } from '@/utils/places-gate';

export const runtime = 'nodejs';

// KC metro bias: suggestions favor the metro without excluding elsewhere.
const KC_CENTER = { latitude: 39.0997, longitude: -94.5786 };
const KC_RADIUS_METERS = 50000; // Places API circle max is 50km

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
    const input = typeof body?.input === 'string' ? body.input.trim() : '';
    const sessionToken = typeof body?.sessionToken === 'string' ? body.sessionToken : '';
    if (input.length < 3) {
      return NextResponse.json({ suggestions: [] });
    }

    const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
      },
      body: JSON.stringify({
        input,
        // Session token makes Google bill keystrokes + the final details call
        // as one Autocomplete session instead of per request.
        ...(sessionToken ? { sessionToken } : {}),
        includedRegionCodes: ['us'],
        locationBias: {
          circle: { center: KC_CENTER, radius: KC_RADIUS_METERS },
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('[places/autocomplete]', res.status, text.slice(0, 300));
      return NextResponse.json({ error: 'Autocomplete failed' }, { status: 502 });
    }

    const data = await res.json().catch(() => null);
    type Suggestion = {
      placePrediction?: {
        placeId?: string;
        structuredFormat?: {
          mainText?: { text?: string };
          secondaryText?: { text?: string };
        };
      };
    };
    const suggestions = ((data?.suggestions ?? []) as Suggestion[])
      .map((s) => s.placePrediction)
      .filter((p): p is NonNullable<Suggestion['placePrediction']> => !!p?.placeId)
      .map((p) => ({
        placeId: p.placeId as string,
        mainText: p.structuredFormat?.mainText?.text ?? '',
        secondaryText: p.structuredFormat?.secondaryText?.text ?? '',
      }));

    return NextResponse.json({ suggestions });
  } catch (err) {
    console.error('[places/autocomplete]', err);
    return NextResponse.json({ error: 'Autocomplete failed' }, { status: 500 });
  }
}
