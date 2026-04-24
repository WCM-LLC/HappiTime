import Link from 'next/link';
import { fetchVenueWithWindows } from '@happitime/shared-api';
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

function formatPrice(cents: number | null | undefined): string | null {
  if (cents == null) return null;
  return `$${(cents / 100).toFixed(2)}`;
}

function priceTierDollars(tier: number | null | undefined): string | null {
  if (!tier || tier < 1) return null;
  return '$'.repeat(tier);
}

type OfferRow = { id: string; name: string; description: string | null; price: number | null };

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
    throwOnError: false
  });

  // Fetch cover photo
  const { data: mediaRows } = await supabase
    .from('venue_media')
    .select('storage_bucket, storage_path, sort_order')
    .eq('venue_id', venueId)
    .eq('status', 'published')
    .eq('type', 'image')
    .order('sort_order', { ascending: true })
    .limit(1);

  const coverRow = mediaRows?.[0] ?? null;
  const coverUrl = coverRow
    ? supabase.storage
        .from(coverRow.storage_bucket || 'venue-media')
        .getPublicUrl(coverRow.storage_path).data?.publicUrl ?? null
    : null;

  // Fetch happy hour offers for all windows
  const windowIds = (windows ?? []).map((w) => w.id);
  const { data: allOffers } = windowIds.length > 0
    ? await supabase
        .from('happy_hour_offers')
        .select('id, name, description, price, window_id')
        .in('window_id', windowIds)
        .eq('status', 'published')
        .order('sort_order', { ascending: true })
    : { data: [] };

  const offersByWindow = (allOffers ?? []).reduce<Record<string, OfferRow[]>>((acc, o: any) => {
    if (!acc[o.window_id]) acc[o.window_id] = [];
    acc[o.window_id].push({ id: o.id, name: o.name, description: o.description, price: o.price });
    return acc;
  }, {});

  const v = venue;
  const windowsForVenue: HappyHourWindow[] = windows ?? [];
  const venueName = v?.name ?? 'This venue';
  // Always use the denormalized org_name on the venue row
  const primaryName = (v as any)?.org_name?.trim() || venueName;
  const venueSubtitle = venueName !== primaryName ? venueName : null;

  const rating = (v as any)?.rating ?? null;
  const priceTier = (v as any)?.price_tier ?? null;

  return (
    <main className={styles.preview}>
      <div className={styles.previewMeta}>
        <div>
          <span className={styles.previewBadge}>Preview</span>
          <span className={styles.previewMetaText}>HappyTime mobile app view</span>
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
                {/* Hero cover */}
                {coverUrl ? (
                  <div className={styles.heroContainer}>
                    <img
                      src={coverUrl}
                      alt={`${primaryName} cover`}
                      className={styles.heroCover}
                    />
                    <div className={styles.heroOverlay}>
                      <h1 className={styles.heroTitle}>{primaryName}</h1>
                      {venueSubtitle ? (
                        <p className={styles.heroSubtitle}>{venueSubtitle}</p>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className={styles.heroPlaceholder}>
                    <h1 className={styles.title}>{primaryName}</h1>
                    {venueSubtitle ? (
                      <p className={styles.venueSubtitleBelow}>{venueSubtitle}</p>
                    ) : null}
                  </div>
                )}

                {/* Venue meta row */}
                {(rating != null || priceTier != null || v?.city) ? (
                  <div className={styles.metaRow}>
                    {rating != null ? (
                      <span className={styles.metaChip}>⭐ {Number(rating).toFixed(1)}</span>
                    ) : null}
                    {priceTier != null ? (
                      <span className={styles.metaChip}>{priceTierDollars(priceTier)}</span>
                    ) : null}
                    {v?.city ? (
                      <span className={styles.metaChip}>{v.city}{v.state ? `, ${v.state}` : ''}</span>
                    ) : null}
                  </div>
                ) : null}

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
                    const offers = offersByWindow[window.id] ?? [];

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

                        {/* Offers / menu items */}
                        {offers.length > 0 ? (
                          <div className={styles.offersSection}>
                            <div className={styles.offersSectionLabel}>Specials</div>
                            {offers.map((offer) => (
                              <div key={offer.id} className={styles.offerRow}>
                                <div className={styles.offerAccentBar} />
                                <div className={styles.offerContent}>
                                  <span className={styles.offerName}>{offer.name}</span>
                                  {offer.description ? (
                                    <span className={styles.offerDesc}>{offer.description}</span>
                                  ) : null}
                                </div>
                                {offer.price != null ? (
                                  <span className={styles.offerPrice}>{formatPrice(offer.price)}</span>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        ) : null}

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
