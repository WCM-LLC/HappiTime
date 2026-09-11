'use client';

import { useEffect } from 'react';
import { trackEvent } from '@/services/analytics';

/**
 * Fires a single analytics event when a server-rendered page mounts.
 * `once` dedupes per-tab via sessionStorage — used for events that must not
 * refire on refresh (e.g. checkout completed).
 */
export default function TrackOnMount({
  event,
  props,
  once,
}: {
  event: string;
  props?: Record<string, string | number | boolean | null>;
  once?: string;
}) {
  useEffect(() => {
    if (once) {
      const key = `ht-tracked:${once}`;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    }
    trackEvent(event, props);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
