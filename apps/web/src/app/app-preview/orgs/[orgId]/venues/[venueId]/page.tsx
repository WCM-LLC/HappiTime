import Link from 'next/link';
import { fetchVenueEvents, fetchVenueWithWindows, fetchWindowMenus } from '@happitime/shared-api';
import type { HappyHourWindow, Menu } from '@happitime/shared-types';
import { createClient } from '@/utils/supabase/server';
import ScheduledEventsPopout, { type ScheduledPreviewEvent } from './ScheduledEventsPopout';
import styles from './preview.module.css';
import { venueImageUrl } from '@/services/media';

export const dynamic = 'force-dynamic';

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
  return dow.map((d) => DOW[d] ?? `D${d}`).join(' · ');
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

function formatPrice(amount: number | string | null | undefined): string | null {
  if (amount == null) return null;
  const value = Number(amount);
  if (!Number.isFinite(value)) return null;
  return `$${value.toFixed(2)}`;
}

function priceTierDollars(tier: number | null | undefined): string | null {
  if (!tier || tier < 1) return null;
  return '$'.repeat(tier);
}

function getDowValues(window: { dow?: unknown }) {
  if (!Array.isArray(window.dow)) return [];
  return window.dow.map((value: unknown) => Number(value)).filter((value) => Number.isFinite(value));
}

function formatAddress(venue: Record<string, any> | null | undefined): string | null {
  if (!venue?.address) return null;
  const address = String(venue.address);
  if (venue.city && address.toLowerCase().includes(String(venue.city).toLowerCase())) {
    return address;
  }

  return [address, venue.city, venue.state, venue.zip].filter(Boolean).join(', ');
}

type PreviewMenu = Pick<Menu, 'id' | 'name' | 'status' | 'is_active'> & {
  sections: {
    id: string;
    name: string;
    sort_order: number;
    items: {
      id: string;
      name: string;
      description: string | null;
      price: number | string | null;
      is_happy_hour?: boolean | null;
      sort_order: number;
    }[];
  }[];
};

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
    ? venueImageUrl(
        { storage_bucket: coverRow.storage_bucket || 'venue-media', storage_path: coverRow.storage_path },
        { w: 800 }
      )
    : null;

  let scheduledEvents: ScheduledPreviewEvent[] = [];
  try {
    const events = await fetchVenueEvents(venueId, { supabase, limit: 12 });
    scheduledEvents = events.map((event: any) => ({
      id: event.id,
      title: event.title,
      description: event.description ?? null,
      event_type: event.event_type ?? 'event',
      starts_at: event.starts_at,
      ends_at: event.ends_at ?? null,
      is_recurring: event.is_recurring ?? false,
      recurrence_rule: event.recurrence_rule ?? null,
      price_info: event.price_info ?? null,
      external_url: event.external_url ?? null,
      ticket_url: event.ticket_url ?? null,
    }));
  } catch (error) {
    console.error('[app-preview] scheduled events load failed', error);
  }

  // Fetch the menus attached to each happy hour window. This mirrors the
  // public app and directory data path: window -> linked menus -> items.
  const windowIds = (windows ?? []).map((w) => w.id);
  const menuItemsByWindowEntries = await Promise.all(
    windowIds.map(async (windowId) => {
      const menus = await fetchWindowMenus(windowId, venueId, {
        supabase,
        status: null,
        isActive: null,
        happyHourOnly: false,
        includeEmptyMenus: true,
      });

      return [windowId, menus] as const;
    })
  );

  const menusByWindow = Object.fromEntries(menuItemsByWindowEntries) as Record<string, PreviewMenu[]>;

  const v = venue;
  const windowsForVenue: HappyHourWindow[] = windows ?? [];
  const venueName = v?.name ?? 'This venue';
  // Always use the denormalized org_name on the venue row
  const primaryName = (v as any)?.org_name?.trim() || venueName;
  const venueSubtitle = venueName !== primaryName ? venueName : null;

  const rating = (v as any)?.rating ?? null;
  const priceTier = (v as any)?.price_tier ?? null;
  const reviewCount = (v as any)?.review_count ?? null;
  const tags = Array.isArray((v as any)?.tags) ? ((v as any).tags as string[]) : [];
  const addressDisplay = formatAddress(v as Record<string, any> | null);

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
                <div className={styles.heroWrap}>
                  <div className={styles.heroCard}>
                    {coverUrl ? (
                      <img
                        src={coverUrl}
                        alt={`${primaryName} cover`}
                        className={styles.heroCover}
                      />
                    ) : (
                      <div className={styles.heroPlaceholder}>
                        <div className={styles.heroInitial}>{primaryName.charAt(0).toUpperCase()}</div>
                        <div className={styles.heroPlaceholderText}>Photos coming soon</div>
                      </div>
                    )}
                  </div>
                  <div className={styles.heroButtons}>
                    <Link className={styles.backButton} href={`/orgs/${orgId}/venues/${venueId}`}>
                      Back
                    </Link>
                    <span className={styles.goButton}>Let&apos;s Go!</span>
                  </div>
                </div>

                <section className={styles.infoSection}>
                  <div className={styles.titleRow}>
                    <h1 className={styles.title}>{primaryName}</h1>
                    <span className={styles.heartButton}>♡</span>
                  </div>
                  {venueSubtitle ? (
                    <p className={styles.subtitle}>{venueSubtitle}</p>
                  ) : null}
                  <div className={styles.metaRow}>
                    {rating != null ? (
                      <span className={styles.ratingPill}>
                        <span className={styles.ratingStar}>★</span>
                        {Number(rating).toFixed(1)}
                        {reviewCount != null ? (
                          <span className={styles.ratingCount}>({Number(reviewCount).toFixed(0)})</span>
                        ) : null}
                      </span>
                    ) : null}
                    {priceTier != null ? (
                      <span className={styles.metaSubtext}>{priceTierDollars(priceTier)}</span>
                    ) : null}
                    {v?.city ? (
                      <span className={styles.metaSubtext}>{v.city}{v.state ? `, ${v.state}` : ''}</span>
                    ) : null}
                  </div>
                  {addressDisplay ? (
                    <p className={styles.address}>{addressDisplay}</p>
                  ) : null}
                  {scheduledEvents.length > 0 ? (
                    <ScheduledEventsPopout events={scheduledEvents} />
                  ) : null}
                  {tags.length > 0 ? (
                    <div className={styles.tagsRow}>
                      {tags.slice(0, 4).map((tag) => (
                        <span key={tag} className={styles.tagPill}>{tag}</span>
                      ))}
                    </div>
                  ) : null}
                </section>

                <div className={styles.list}>
                  {windowsForVenue.map((window) => {
                    const label = window.label?.trim() ?? '';
                    const lastConfirmedRaw =
                      window.last_confirmed_at ??
                      v?.last_confirmed_at ??
                      window.updated_at ??
                      v?.updated_at ??
                      null;
                    const lastConfirmedText = timeAgo(lastConfirmedRaw);
                    const timeLabel = formatTimeRange(window.start_time, window.end_time);
                    const menus = menusByWindow[window.id] ?? [];
                    const isToday = getDowValues(window).includes(new Date().getDay());

                    return (
                      <section key={window.id} className={styles.windowBlock}>
                        <div className={styles.windowHeader}>
                          <div>
                            <div className={styles.windowTitle}>{label || 'Happy Hour'}</div>
                            {isToday ? (
                              <div className={styles.todayText}>Active today</div>
                            ) : null}
                          </div>
                          <span className={styles.windowBadge}>HH</span>
                        </div>

                        <div className={styles.detailRow}>
                          <div className={styles.detailCard}>
                            <div className={styles.detailLabel}>When</div>
                            <div className={styles.detailValue}>{timeLabel}</div>
                          </div>
                          <div className={styles.detailCard}>
                            <div className={styles.detailLabel}>Days</div>
                            <div className={styles.detailValue}>{formatDays(window.dow ?? [])}</div>
                          </div>
                        </div>

                        <div className={styles.menuSection}>
                          <div className={styles.sectionTitle}>Menu Preview</div>
                          {menus.length > 0 ? (
                            <div className={styles.menuList}>
                              {menus.map((menu) => (
                                <div key={menu.id} className={styles.menuBlock}>
                                  {menus.length > 1 || menu.sections.length === 0 ? (
                                    <div className={styles.menuName}>{menu.name}</div>
                                  ) : null}
                                  {menu.sections.length > 0 ? (
                                    menu.sections.map((section) => (
                                      <div key={section.id} className={styles.menuSectionBlock}>
                                        {menu.sections.length > 1 || section.items.length === 0 ? (
                                          <div className={styles.menuSectionName}>{section.name}</div>
                                        ) : null}
                                        {section.items.length > 0 ? (
                                          section.items.map((item, itemIndex) => (
                                            <div key={item.id} className={styles.menuRow}>
                                              <div
                                                className={
                                                  itemIndex === 0
                                                    ? `${styles.menuDot} ${styles.menuDotActive}`
                                                    : `${styles.menuDot} ${styles.menuDotInactive}`
                                                }
                                              />
                                              <div className={styles.menuTextWrap}>
                                                <div className={styles.menuItemLine}>
                                                  <span className={styles.menuItemText}>{item.name}</span>
                                                  {item.price != null ? (
                                                    <span className={styles.menuItemPrice}>
                                                      {formatPrice(item.price)}
                                                    </span>
                                                  ) : null}
                                                </div>
                                                {item.description ? (
                                                  <div className={styles.menuItemDescription}>
                                                    {item.description}
                                                  </div>
                                                ) : null}
                                              </div>
                                            </div>
                                          ))
                                        ) : (
                                          <div className={styles.menuEmpty}>No items in this section yet.</div>
                                        )}
                                      </div>
                                    ))
                                  ) : (
                                    <div className={styles.menuEmpty}>No sections or items added yet.</div>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className={styles.menuEmpty}>Menu coming soon.</div>
                          )}
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
                      </section>
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
