import Link from 'next/link';
import { redirect } from 'next/navigation';
import UserBar from '@/components/layout/UserBar';
import { createClient } from '@/utils/supabase/server';
import { METRICS_PATH, REFERRALS_PATH, loginPathFor } from '@/utils/auth-paths';
import { StatTile } from '@/components/metrics/StatTile';
import { Sparkline } from '@/components/metrics/Sparkline';
import { ReachChart } from '@/components/metrics/ReachChart';
import { BarList } from '@/components/metrics/BarList';
import { delta, deltaPct, fmtDate, fmtInt, fmtPct } from '@/components/metrics/format';
import {
  RANGE_LABEL,
  getSuperUserMetrics,
  milestonesFor,
  parseRange,
  type MetricsRange,
} from '@/lib/super-user-metrics';

export const dynamic = 'force-dynamic';

const RANGES: MetricsRange[] = ['7d', '28d', '90d', 'all'];

const DEF = {
  people_sent: 'Check-ins by someone within the attribution window after a touch from you — QR, referral or guide tap.',
  new_faces: 'Of the people you sent, those checking in at that venue for the first time.',
  venues_moved: 'Distinct venues with at least one attributed check-in in this range.',
  redemptions: 'Rounds redeemed by people you referred.',
  venues_touched: 'Venues someone saw through you (itinerary opens and taps) in this range, whether or not they checked in.',
  views: 'Opens of your published guides on happitime.biz and in the app. Tracked since Oct 2026.',
  venue_clicks: 'Taps from your guide to a venue page.',
  ctr: 'Venue clicks ÷ views. Shown once a guide has 20+ views.',
  joined: 'Accounts created through your QR or link.',
  qr_scans: 'Opens of your happitime.biz/r/ link — from a QR, a bio link or a share.',
  first_checkins: 'People you referred who have checked in somewhere at least once.',
  itinerary_saves: 'Times someone saved one of your itineraries.',
};

function Section({ id, title, sub, children }: { id: string; title: string; sub: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="min-w-0 rounded-lg border border-border bg-surface p-5 shadow-sm flex flex-col gap-[18px] scroll-mt-20">
      <div className="flex flex-col gap-0.5">
        <h2 id={`${id}-h`} className="text-heading-sm font-semibold text-foreground">{title}</h2>
        <p className="text-[13px] text-muted">{sub}</p>
      </div>
      {children}
    </section>
  );
}

function Mini({ label, value, note, tone, info }: { label: string; value: string; note?: string; tone?: 'up' | 'flat' | 'none'; info?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-caption font-semibold uppercase tracking-[0.06em] text-muted flex items-center gap-1.5">
        {label}
        {info ? <span title={info} className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-border-strong text-[10px] font-bold text-muted cursor-help">i</span> : null}
      </span>
      <span className="text-[1.5rem] leading-none font-bold tracking-[-0.02em] tabular-nums text-foreground">{value}</span>
      {note ? <span className={`text-caption font-medium ${tone === 'up' ? 'text-success-ink' : 'text-muted'}`}>{note}</span> : null}
    </div>
  );
}

export default async function MetricsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const sp = await searchParams;
  const range = parseRange(sp.range);

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) redirect(loginPathFor(METRICS_PATH));

  const [{ data: profile }, { data: m, error }] = await Promise.all([
    supabase.from('user_profiles').select('role, handle, display_name').eq('user_id', user.id).maybeSingle(),
    getSuperUserMetrics(supabase, range),
  ]);
  if ((profile as any)?.role !== 'super_user') {
    const { data: adminOk } = await supabase.rpc('is_happitime_admin');
    if (!adminOk) redirect(loginPathFor(METRICS_PATH, 'not_authorized'));
  }

  const inf = m?.influence;
  const g = m?.guides;
  const r = m?.referrals;
  const all = range === 'all';
  const windowText = m
    ? all
      ? 'All time'
      : `${fmtDate(m.window_start)} – ${fmtDate(m.window_end)}, ${new Date(m.window_end).getFullYear()} · compared with the ${RANGE_LABEL[range].toLowerCase()} before`
    : '';
  const milestones = m ? milestonesFor(m.totals) : [];
  const peopleDelta = inf ? delta(inf.people_sent, inf.people_sent_prior) : null;
  const peakNote = (() => {
    if (!m || !inf?.people_sent) return null;
    const best = m.daily.reduce((a, b) => (b.people_sent > a.people_sent ? b : a), m.daily[0]);
    return best && best.people_sent > 0 ? `${inf.new_faces} of them had never checked in at that venue before. Your best day was ${fmtDate(`${best.day}T12:00:00Z`)}.` : null;
  })();
  const published = (g?.items ?? []).filter((x) => x.status === 'published');

  return (
    <div className="min-h-screen bg-background">
      <UserBar />
      <main className="max-w-[var(--width-content)] mx-auto px-6 py-8 flex flex-col gap-7">
        {/* Title + range */}
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Link href="/dashboard" className="text-body-sm text-muted hover:text-foreground transition-colors">Home</Link>
              <span className="text-muted-light">/</span>
              <span className="text-body-sm text-foreground font-medium">Metrics</span>
            </div>
            <h1 className="text-display-md font-bold text-foreground tracking-tight">Your reach</h1>
            <p className="text-body-sm text-muted">{windowText}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div role="group" aria-label="Date range" className="inline-flex gap-0.5 rounded-md border border-border bg-surface p-[3px]">
              {RANGES.map((rg) => (
                <Link
                  key={rg}
                  href={`${METRICS_PATH}?range=${rg}`}
                  aria-current={rg === range ? 'page' : undefined}
                  className={`inline-flex h-[34px] items-center rounded-[8px] px-3.5 text-[13px] font-medium transition-colors ${rg === range ? 'bg-dark text-dark-foreground' : 'text-muted hover:text-foreground'}`}
                >
                  {RANGE_LABEL[rg]}
                </Link>
              ))}
            </div>
            <a
              href={`/api/metrics/card?range=${range}`}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-brand px-4 text-body-sm font-semibold text-dark hover:bg-brand-hover transition-colors"
              download={`happitime-stats-${m?.handle ?? 'card'}.png`}
            >
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13" /></svg>
              Share stats card
            </a>
          </div>
        </div>

        {error ? (
          <div className="rounded-md border border-error bg-error-light px-4 py-3">
            <p className="text-body-sm font-medium text-error">Metrics are unavailable right now</p>
            <p className="text-body-sm text-error/80 mt-0.5">{error}</p>
          </div>
        ) : null}

        {m ? (
          <>
            {/* Reach hero */}
            <section className="rounded-lg border border-border bg-surface px-7 pt-7 pb-5 shadow-sm flex flex-col gap-5">
              <div className="flex flex-wrap items-start justify-between gap-6">
                <div className="flex flex-col gap-2">
                  <h2 className="text-caption font-semibold uppercase tracking-[0.06em] text-muted flex items-center gap-1.5">
                    People you sent to venues
                    <span title={DEF.people_sent} className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-border-strong text-[10px] font-bold text-muted cursor-help">i</span>
                  </h2>
                  <div className="flex flex-wrap items-baseline gap-4">
                    <div className={`text-[4rem] leading-none font-bold tracking-[-0.04em] tabular-nums ${inf?.people_sent ? 'text-foreground' : 'text-muted-light'}`}>{fmtInt(inf?.people_sent ?? 0)}</div>
                    {peopleDelta && peopleDelta.text ? (
                      <div className={`flex items-center gap-1.5 text-[15px] font-semibold ${peopleDelta.tone === 'up' ? 'text-success-ink' : 'text-muted'}`}>
                        {peopleDelta.text}
                        {inf?.people_sent_prior !== null && inf?.people_sent_prior !== undefined ? <span className="text-muted font-medium"> ({fmtInt(inf.people_sent_prior)} before)</span> : null}
                      </div>
                    ) : null}
                  </div>
                  <p className="text-body-sm text-muted max-w-[520px]">
                    {peakNote ?? 'This number moves when someone checks in at a venue after a touch from you — opening your guide as an itinerary in the app, scanning your QR, or joining through your link.'}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-[13px] text-muted">
                  <span aria-hidden="true" className="inline-block h-[3px] w-3.5 rounded-sm bg-brand" />People sent per day
                </div>
              </div>
              <ReachChart daily={m.daily} label={`Daily people sent, ${windowText}`} />
            </section>

            {/* Milestones */}
            {milestones.length ? (
              <section aria-label="Milestones" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {milestones.map((ms) => (
                  <div key={ms.key} className={`flex items-center gap-3 rounded-md border px-3.5 py-3 ${ms.done ? 'border-brand-light bg-brand-subtle' : 'border-border bg-surface'}`}>
                    {ms.done ? (
                      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8B6535" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                    ) : (
                      <div aria-hidden="true" className="relative h-5 w-5 shrink-0 rounded-full" style={{ background: `conic-gradient(#C8965A 0 ${Math.round((ms.value / ms.target) * 100)}%, #E8E8E5 ${Math.round((ms.value / ms.target) * 100)}% 100%)` }}>
                        <div className="absolute inset-1 rounded-full bg-surface" />
                      </div>
                    )}
                    <div className="flex flex-col min-w-0">
                      <span className="text-[13px] font-semibold text-foreground truncate">{ms.label}</span>
                      <span className={`text-caption tabular-nums ${ms.done ? 'text-brand-dark-alt' : 'text-muted'}`}>
                        {ms.done ? 'Reached' : `${fmtInt(ms.value)} · ${Math.round((ms.value / ms.target) * 100)}%`}
                      </span>
                    </div>
                  </div>
                ))}
              </section>
            ) : null}

            {/* Three columns */}
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 items-start">
              <Section id="influence" title="Influence" sub="What happened at venues because of you">
                <div className="grid grid-cols-2 gap-3.5">
                  <Mini label="New faces" value={fmtInt(inf?.new_faces ?? 0)} note={inf ? delta(inf.new_faces, inf.new_faces_prior).text : undefined} tone={inf ? delta(inf.new_faces, inf.new_faces_prior).tone : undefined} info={DEF.new_faces} />
                  <Mini label="Venues moved" value={fmtInt(inf?.venues_moved ?? 0)} note={inf ? delta(inf.venues_moved, inf.venues_moved_prior).text : undefined} tone={inf ? delta(inf.venues_moved, inf.venues_moved_prior).tone : undefined} info={DEF.venues_moved} />
                  <Mini label="Redemptions" value={fmtInt(inf?.redemptions ?? 0)} note={inf ? delta(inf.redemptions, inf.redemptions_prior).text : undefined} tone={inf ? delta(inf.redemptions, inf.redemptions_prior).tone : undefined} info={DEF.redemptions} />
                  <Mini label="Venues touched" value={fmtInt(inf?.venues_touched ?? 0)} info={DEF.venues_touched} />
                </div>
                <div className="flex flex-col gap-2.5">
                  <div className="text-caption font-semibold uppercase tracking-[0.06em] text-muted">Venues you&rsquo;re moving</div>
                  <BarList
                    rows={(inf?.venues ?? []).slice(0, 8).map((v) => ({ key: v.venue_id, label: v.name, sub: v.neighborhood, value: v.people_sent, valueNote: v.new_faces ? `${v.new_faces} new` : null }))}
                    emptyText="Nobody has checked in after a touch from you yet. The first one shows up here."
                  />
                </div>
              </Section>

              <Section id="guides" title="Guides" sub="How each one is read and acted on">
                <div className="grid grid-cols-2 gap-3.5">
                  <Mini label="Views" value={fmtInt(g?.views ?? 0)} note={g ? deltaPct(g.views, g.views_prior).text : undefined} tone={g ? deltaPct(g.views, g.views_prior).tone : undefined} info={DEF.views} />
                  <Mini label="Venue clicks" value={fmtInt(g?.venue_clicks ?? 0)} note={g ? deltaPct(g.venue_clicks, g.venue_clicks_prior).text : undefined} tone={g ? deltaPct(g.venue_clicks, g.venue_clicks_prior).tone : undefined} info={DEF.venue_clicks} />
                  <Mini label="Click-through" value={g && g.views >= 20 ? fmtPct(g.venue_clicks / g.views) : '—'} note={g && g.views < 20 ? 'shown at 20+ views' : undefined} info={DEF.ctr} />
                  <Mini label="People sent" value={fmtInt(g?.people_sent ?? 0)} note={g ? delta(g.people_sent, g.people_sent_prior).text : undefined} tone={g ? delta(g.people_sent, g.people_sent_prior).tone : undefined} info="Check-ins after someone opened one of your guides as an itinerary in the app." />
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex items-baseline justify-between">
                    <span className="text-caption font-semibold uppercase tracking-[0.06em] text-muted">By guide · {RANGE_LABEL[range].toLowerCase()}</span>
                    <span className="text-caption font-semibold uppercase tracking-[0.06em] text-brand-dark-alt">People sent</span>
                  </div>
                  {published.length === 0 ? (
                    <p className="text-body-sm text-muted">No published guides yet.</p>
                  ) : (
                    <ul className="m-0 list-none p-0 flex flex-col">
                      {published.map((p, i) => (
                        <li key={p.guide_id} className={`flex flex-col gap-1.5 py-3 ${i < published.length - 1 ? 'border-b border-border' : ''}`}>
                          <Link href={`/dashboard/guides/${p.guide_id}/edit`} className="text-body-sm font-semibold text-foreground leading-snug hover:underline">{p.title}</Link>
                          <div className="flex items-center gap-3">
                            <span className="flex-1 text-caption text-muted tabular-nums">
                              {fmtInt(p.views)} views · {fmtInt(p.venue_clicks)} clicks{p.ctr !== null ? ` · ${fmtPct(p.ctr)}` : ''}
                            </span>
                            <Sparkline values={p.daily.map((d) => d.views)} width={72} height={22} label={`Daily views for ${p.title}`} />
                            <span className="w-8 text-right text-[16px] font-bold tabular-nums text-brand-dark-alt">{fmtInt(p.people_sent)}</span>
                          </div>
                          {p.venues.length ? (
                            <span className="text-caption text-muted">Sent people to {p.venues.slice(0, 3).map((v) => v.name).join(', ')}{p.venues.length > 3 ? ` +${p.venues.length - 3}` : ''}</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                  {g?.draft_count ? <Link href="/dashboard/guides" className="text-[13px] font-medium text-muted hover:text-foreground">{g.draft_count} draft{g.draft_count === 1 ? '' : 's'} →</Link> : null}
                </div>
              </Section>

              <Section id="referrals" title="Referrals" sub="People who joined HappiTime through you">
                <div className="grid grid-cols-2 gap-3.5">
                  <Mini label="Joined" value={fmtInt(r?.joined ?? 0)} note={r ? delta(r.joined, r.joined_prior).text : undefined} tone={r ? delta(r.joined, r.joined_prior).tone : undefined} info={DEF.joined} />
                  <Mini label="QR scans" value={fmtInt(r?.qr_scans ?? 0)} note={r ? delta(r.qr_scans, r.qr_scans_prior).text : undefined} tone={r ? delta(r.qr_scans, r.qr_scans_prior).tone : undefined} info={DEF.qr_scans} />
                  <Mini label="First check-ins" value={fmtInt(r?.first_checkins ?? 0)} note={r ? `of ${fmtInt(r.joined_all)} joined` : undefined} info={DEF.first_checkins} />
                  <Mini label="Itinerary saves" value={fmtInt(r?.itinerary_saves ?? 0)} info={DEF.itinerary_saves} />
                </div>
                <div className="flex flex-col gap-2.5">
                  <div className="text-caption font-semibold uppercase tracking-[0.06em] text-muted">Scans → joins, by week</div>
                  {r && r.weekly.length ? (
                    <WeeklyBars weekly={r.weekly} />
                  ) : null}
                </div>
                <div className="rounded-md border border-border bg-background px-3.5 py-3 text-body-sm flex flex-col gap-1">
                  {r && r.qr_scans_all > 0 ? (
                    <>
                      <span className="font-semibold text-foreground">{fmtInt(r.qr_scans_all)} scans all time</span>
                      <span className="text-muted">{fmtInt(r.joined_all)} joined through you. <Link href={REFERRALS_PATH} className="font-medium text-brand-dark-alt hover:underline">Print another QR →</Link></span>
                    </>
                  ) : (
                    <>
                      <span className="font-semibold text-foreground">Your QR hasn&rsquo;t been scanned yet</span>
                      <span className="text-muted">Ask your favorite bartender if you can leave a card at the rail. <Link href={REFERRALS_PATH} className="font-medium text-brand-dark-alt hover:underline">Print a table card →</Link></span>
                    </>
                  )}
                </div>
              </Section>
            </div>

            <div className="flex flex-wrap gap-6 pt-1 text-caption text-muted">
              <span>Influence and referrals are counted separately and never overlap.</span>
              <span>Guide views and QR scans tracked since Oct 2026.</span>
              <span>Numbers are live.</span>
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}

function WeeklyBars({ weekly }: { weekly: { week_start: string; scans: number; joined: number }[] }) {
  const rows = weekly.slice(-8);
  const max = Math.max(1, ...rows.map((w) => Math.max(w.scans, w.joined)));
  const W = 300;
  const H = 120;
  const slot = W / rows.length;
  const bw = Math.min(22, slot * 0.36);
  return (
    <div className="flex flex-col gap-2.5">
      <svg role="img" aria-label="QR scans and joins by week" viewBox={`0 0 ${W} ${H}`} width="100%" height={H} className="block">
        <line x1="0" y1="100" x2={W} y2="100" stroke="#E8E8E5" />
        {rows.map((w, i) => {
          const x0 = i * slot + (slot - bw * 2 - 4) / 2;
          const hs = (w.scans / max) * 90;
          const hj = (w.joined / max) * 90;
          return (
            <g key={w.week_start}>
              {hs > 0 ? <rect x={x0} y={100 - hs} width={bw} height={hs} rx="4" fill="#E8D5BC" /> : <text x={x0 + bw / 2} y="96" textAnchor="middle" fontSize="10" fill="#9CA3AF" fontFamily="Inter, sans-serif">0</text>}
              {hj > 0 ? <rect x={x0 + bw + 4} y={100 - hj} width={bw} height={hj} rx="4" fill="#C8965A" /> : null}
              <text x={i * slot + slot / 2} y="116" textAnchor="middle" fontSize="10" fill="#9CA3AF" fontFamily="Inter, sans-serif">
                {new Date(`${w.week_start}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="flex gap-4 text-caption text-muted">
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-[3px] bg-brand-light" />Scans</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-[3px] bg-brand" />Joined</span>
      </div>
    </div>
  );
}
