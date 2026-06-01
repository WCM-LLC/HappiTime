export interface ScanWindows {
  todayStart: string;
  weekStart: string;
  monthStart: string;
}

export interface ScanEvent {
  source: string;
  created_at: string;
}

export interface ScanSummary {
  today: number;
  week: number;
  month: number;
  bySource: { qr: number; app_checkin: number; push_click: number; organic: number };
  recent: ScanEvent[];
}

export declare function computeWindows(timezone: string, now: Date): ScanWindows;
export declare function summarizeScans(events: ScanEvent[], windows: ScanWindows): ScanSummary;
export declare function formatRelativeTime(fromISO: string, now: Date): string;
