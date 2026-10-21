import type { ProposedEvent } from './intake-content';

export declare const TASTEMAKER_EVENT_TYPES: readonly string[];
export declare const TASTEMAKER_EVENT_LIMITS: { title: number; description: number; priceInfo: number };

export function localDateString(now: Date, timezone: string): string;
export function isSafeHttpUrl(value: string): boolean;

export type TastemakerEventFields = {
  venue_id?: string;
  title?: string;
  description?: string;
  event_type?: string;
  date?: string;
  start_time?: string;
  end_time?: string;
  is_recurring?: string | boolean;
  dow?: string[] | string | null;
  price_info?: string;
  external_url?: string;
};

export type TastemakerEventParse =
  | {
      ok: true;
      venueId: string;
      externalUrl: string | null;
      contentType: 'event' | 'event_series';
      proposed: ProposedEvent;
    }
  | { ok: false; errors: string[] };

export function parseTastemakerEventForm(
  fields: TastemakerEventFields,
  opts?: { now?: Date; timezone?: string },
): TastemakerEventParse;
