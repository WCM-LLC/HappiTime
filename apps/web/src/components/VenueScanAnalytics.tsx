import { formatRelativeTime, type ScanSummary } from '@/utils/scan-analytics';

const SOURCE_LABELS: Record<string, string> = {
  qr: 'QR',
  app_checkin: 'Check-in',
  push_click: 'Push',
  organic: 'Organic',
};

const SOURCE_ORDER = ['qr', 'app_checkin', 'push_click', 'organic'] as const;

export function VenueScanAnalytics({ summary }: { summary: ScanSummary }) {
  const now = new Date();
  const { today, week, month, bySource, recent } = summary;

  return (
    <div className="rounded-lg border border-border bg-surface p-6 shadow-sm mb-8">
      <div className="mb-4">
        <h2 className="text-heading-sm font-semibold text-foreground">Scan activity</h2>
        <p className="text-body-sm text-muted mt-0.5">
          Visits attributed to this venue — QR scans, check-ins, and opens.
        </p>
      </div>

      {month === 0 ? (
        <p className="text-body-sm text-muted">
          No scans yet — print your QR code (above) and place it in your venue.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-body-sm text-foreground">
            <span><span className="font-semibold">{today}</span> <span className="text-muted">today</span></span>
            <span><span className="font-semibold">{week}</span> <span className="text-muted">last 7 days</span></span>
            <span><span className="font-semibold">{month}</span> <span className="text-muted">last 30 days</span></span>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {SOURCE_ORDER.map((s) => (
              <span
                key={s}
                className="inline-flex items-center rounded-full bg-brand-subtle px-2.5 py-1 text-caption font-medium text-brand-text"
              >
                {SOURCE_LABELS[s]} {bySource[s]}
              </span>
            ))}
          </div>

          {recent.length > 0 ? (
            <ul className="mt-4 divide-y divide-border">
              {recent.map((e, i) => {
                const who = e.handle ? `@${e.handle}` : e.display_name || 'Anonymous';
                return (
                  <li key={i} className="flex items-center justify-between gap-3 py-2 text-body-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`truncate ${e.handle ? 'font-medium text-foreground' : 'text-muted'}`}
                      >
                        {who}
                      </span>
                      <span className="inline-flex items-center rounded-full bg-brand-subtle px-2 py-0.5 text-caption font-medium text-brand-text shrink-0">
                        {SOURCE_LABELS[e.source] ?? e.source}
                      </span>
                    </div>
                    <span
                      className="text-muted shrink-0"
                      title={new Date(e.created_at).toLocaleString()}
                    >
                      {formatRelativeTime(e.created_at, now)}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </>
      )}
    </div>
  );
}

export default VenueScanAnalytics;
