export type VenueEvent = {
  orgId: string;
  venueId: string;
  eventType: string;
  userId?: string | null;
  meta?: Record<string, unknown>;
  occurredAt?: string;
};

export type IngestResult = {
  ok: boolean;
  inserted?: number;
  error?: string;
};

const DEFAULT_INGEST_PATH = '/api/events/ingest';

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'unknown_error';
}

export async function ingestEvents(
  input: VenueEvent | VenueEvent[]
): Promise<IngestResult> {
  const events = Array.isArray(input) ? input : [input];
  if (!events.length) return { ok: true, inserted: 0 };

  const url = process.env.NEXT_PUBLIC_EVENTS_INGEST_URL ?? DEFAULT_INGEST_PATH;
  if (!url || typeof fetch !== 'function') {
    return { ok: false, error: 'missing_ingest_url' };
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { ok: false, error: 'offline' };
  }

  const apiKey =
    process.env.NEXT_PUBLIC_EVENTS_INGEST_API_KEY ??
    process.env.EVENTS_INGEST_API_KEY;

  const payload = events.map((event) => ({
    org_id: event.orgId,
    venue_id: event.venueId,
    user_id: event.userId ?? null,
    event_type: event.eventType,
    meta: event.meta ?? {},
    occurred_at: event.occurredAt ?? new Date().toISOString(),
  }));

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(apiKey ? { 'x-api-key': apiKey } : {}),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return { ok: false, error: `http_${response.status}` };
    }

    const data = await response.json().catch(() => null);
    return {
      ok: true,
      inserted: typeof data?.inserted === 'number' ? data.inserted : events.length,
    };
  } catch (error) {
    return { ok: false, error: normalizeErrorMessage(error) };
  }
}
