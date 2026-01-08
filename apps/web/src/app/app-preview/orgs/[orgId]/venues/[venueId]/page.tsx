import Link from 'next/link';
import { fetchVenueWithWindows, type VenueWithOrganization } from '@happitime/shared-api';
import type { HappyHourWindow } from '@happitime/shared-types';
import { createClient } from '@/utils/supabase/server';
import styles from './preview.module.css';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatTimeRange(start: string, end: string): string {
  if (!start || !end) return '';
  const [sh, sm] = start.split(':');
  const [eh, em] = end.split(':');
  const startHour = Number(sh);
  const startMin = Number(sm ?? '0');
  const endHour = Number(eh);
  const endMin = Number(em ?? '0');
  if (
    !Number.isFinite(startHour) ||
    !Number.isFinite(startMin) ||
    !Number.isFinite(endHour) ||
    !Number.isFinite(endMin)
  ) {
    return `${start} - ${end}`;
  }

  const format = (h: number, m: number) => {
    const suffix = h >= 12 ? 'PM' : 'AM';
    const hour12 = ((h + 11) % 12) + 1;
    return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
  };

  return `${format(startHour, startMin)} - ${format(endHour, endMin)}`;
}

function formatDays(dow: number[]): string {
  if (!dow || dow.length === 0) return 'No days set';
  return dow.map((d) => DOW[d] ?? `D${d}`).join(', ');
}

function timeAgo(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return null;

  const diffMs = Date.now() - ts;
  if (diffMs < 0) return null;

  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays < 1) return 'today';
  if (diffDays < 2) return 'yesterday';
  if (diffDays < 7) return `${Math.floor(diffDays)} days ago`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
  }
  const months = Math.floor(diffDays / 30);
  return months === 1 ? '1 month ago' : `${months} months ago`;
}

export default async function AppPreviewVenuePage({
  params,
}: {
  params: Promise<{ orgId: string; venueId: string }>;
}) {
  const { orgId, venueId } = await params;
  const supabase = await createClient();

  const {
    venue,
    windows,
    venueError: venueErr,
    windowsError: windowsErr
  } = await fetchVenueWithWindows(venueId, {
    supabase,
    orgId,
    includeOrganization: true,
    throwOnError: false
  });

  const { count: venueCount, error: venueCountErr } = await supabase
    .from('venues')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId);

  const v: VenueWithOrganization | null = venue;
  const windowsForVenue: HappyHourWindow[] = windows ?? [];
  const fallbackVenueName = v?.name ?? 'This venue';
  const orgName = v?.org?.name ?? null;
  const appNamePreference = v?.app_name_preference ?? 'org';
  const hasMultipleVenues =
    !venueCountErr && typeof venueCount === 'number' ? venueCount > 1 : false;
  const primaryName = (() => {
    if (!orgName) return fallbackVenueName;
    if (appNamePreference === 'venue') return fallbackVenueName;
    return orgName;
  })();
  const venueSubtitle =
    orgName && hasMultipleVenues && appNamePreference !== 'venue' ? fallbackVenueName : null;

  return (
    <main className={styles.preview}>
      <div className={styles.previewMeta}>
        <div>
          <span className={styles.previewBadge}>Preview</span>
          <span className={styles.previewMetaText}>HappyHour mobile app view</span>
        </div>
        <Link className={styles.previewLink} href={`/orgs/${orgId}/venues/${venueId}`}>
          Back to editor
        </Link>
      </div>

      <div className={styles.phoneShell}>
        <div className={styles.phone}>
          <div className={styles.screen}>
            {venueErr && windowsForVenue.length === 0 ? (
              <p className={styles.errorText}>Could not load venue details.</p>
            ) : null}
            {windowsErr && windowsForVenue.length === 0 ? (
              <p className={styles.errorText}>Could not load happy hour windows.</p>
            ) : null}

            {windowsForVenue.length === 0 && !windowsErr ? (
              <p className={styles.emptyText}>
                {primaryName} doesn&apos;t have any published happy hour windows yet.
              </p>
            ) : null}

            {windowsForVenue.length > 0 ? (
              <>
                <h1 className={styles.title}>{primaryName}</h1>
                <p className={styles.subtitle}>Preview of this venue in the app</p>

                <div className={styles.list}>
                  {windowsForVenue.map((window) => {
                    const windowVenue = v;
                    const label = window.label?.trim() ?? '';
                    const lastConfirmedRaw =
                      window.last_confirmed_at ??
                      windowVenue?.last_confirmed_at ??
                      window.updated_at ??
                      windowVenue?.updated_at ??
                      null;
                    const lastConfirmedText = timeAgo(lastConfirmedRaw);
                    const timeLabel = formatTimeRange(window.start_time, window.end_time);
                    const timezoneLabel = window.timezone ? ` (${window.timezone})` : '';

                    return (
                      <div key={window.id} className={styles.card}>
                        <div className={styles.cardHeaderRow}>
                          <div>
                            <div className={styles.venueName}>{primaryName}</div>
                            {venueSubtitle ? (
                              <div className={styles.venueSubtitle}>{venueSubtitle}</div>
                            ) : null}
                            {windowVenue?.address ? (
                              <div className={styles.address}>{windowVenue.address}</div>
                            ) : null}
                          </div>
                          <div className={styles.cardHeaderMeta}>
                            {label ? (
                              <div className={styles.labelPill}>
                                <span className={styles.labelText}>{label}</span>
                              </div>
                            ) : null}
                          </div>
                        </div>

                        <div className={styles.row}>
                          <span className={styles.rowLabel}>When</span>
                          <span className={styles.rowValue}>
                            {timeLabel}
                            {timezoneLabel}
                          </span>
                        </div>

                        <div className={styles.row}>
                          <span className={styles.rowLabel}>Days</span>
                          <span className={styles.rowValue}>{formatDays(window.dow ?? [])}</span>
                        </div>

                        <div className={styles.footerRow}>
                          {lastConfirmedText ? (
                            <span className={styles.verifiedText}>Verified {lastConfirmedText}</span>
                          ) : (
                            <span className={styles.verifiedTextMuted}>
                              Last updated info not available
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}
