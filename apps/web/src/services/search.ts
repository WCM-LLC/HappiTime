export type SearchVenueResult = {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  score?: number;
  distanceMiles?: number;
  meta?: Record<string, unknown>;
};

export type SearchOptions = {
  limit?: number;
  filters?: Record<string, string | number | boolean>;
  near?: { lat: number; lng: number };
  radiusMiles?: number;
};

function shouldDebug(): boolean {
  return process.env.NODE_ENV === 'development';
}

function normalizeResults(input: unknown): SearchVenueResult[] {
  if (!Array.isArray(input)) return [];
  return input.map((item, index) => ({
    id: String((item as any)?.id ?? index),
    name: String((item as any)?.name ?? 'Unknown'),
    address: (item as any)?.address ?? null,
    city: (item as any)?.city ?? null,
    state: (item as any)?.state ?? null,
    score: typeof (item as any)?.score === 'number' ? (item as any).score : undefined,
    distanceMiles:
      typeof (item as any)?.distanceMiles === 'number' ? (item as any).distanceMiles : undefined,
    meta: (item as any)?.meta ?? undefined,
  }));
}

export async function searchVenues(
  query: string,
  options: SearchOptions = {}
): Promise<SearchVenueResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const endpoint = process.env.NEXT_PUBLIC_SEARCH_API_URL;
  if (!endpoint || typeof fetch !== 'function') {
    if (shouldDebug() && typeof console !== 'undefined') {
      console.log('[search] missing NEXT_PUBLIC_SEARCH_API_URL');
    }
    return [];
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return [];
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: trimmed, ...options }),
    });

    if (!response.ok) return [];
    const data = await response.json().catch(() => null);
    return normalizeResults(data?.hits ?? data?.results ?? data);
  } catch {
    return [];
  }
}

export async function getRecommendedVenues(
  seedVenueId: string,
  options: SearchOptions = {}
): Promise<SearchVenueResult[]> {
  if (!seedVenueId) return [];

  const endpoint = process.env.NEXT_PUBLIC_RECOMMENDATIONS_API_URL;
  if (!endpoint || typeof fetch !== 'function') {
    if (shouldDebug() && typeof console !== 'undefined') {
      console.log('[search] missing NEXT_PUBLIC_RECOMMENDATIONS_API_URL');
    }
    return [];
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return [];
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ seedVenueId, ...options }),
    });

    if (!response.ok) return [];
    const data = await response.json().catch(() => null);
    return normalizeResults(data?.hits ?? data?.results ?? data);
  } catch {
    return [];
  }
}
