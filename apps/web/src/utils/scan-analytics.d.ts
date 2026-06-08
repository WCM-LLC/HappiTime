export interface ScanWindows {
  todayStart: string;
  weekStart: string;
  monthStart: string;
}

export interface ScanEvent {
  source: string;
  created_at: string;
  /** Authenticated scanner (check-ins only); null/absent for anonymous QR/push/organic. */
  user_id?: string | null;
  handle?: string | null;
  display_name?: string | null;
}

/** A per-scan row for the dashboard log: source + time, plus handle when known. */
export interface ScanRecent {
  source: string;
  created_at: string;
  handle: string | null;
  display_name: string | null;
}

export interface ScanSummary {
  today: number;
  week: number;
  month: number;
  bySource: { qr: number; app_checkin: number; push_click: number; organic: number };
  recent: ScanRecent[];
}

export declare function computeWindows(timezone: string, now: Date): ScanWindows;
export declare function summarizeScans(events: ScanEvent[], windows: ScanWindows): ScanSummary;
export declare function formatRelativeTime(fromISO: string, now: Date): string;
