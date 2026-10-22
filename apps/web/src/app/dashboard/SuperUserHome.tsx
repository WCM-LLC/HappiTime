import Link from 'next/link';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { StatTile } from '@/components/metrics/StatTile';
import { Sparkline } from '@/components/metrics/Sparkline';
import { BarList } from '@/components/metrics/BarList';
import { delta, deltaPct, fmtDate, fmtInt, fmtPct } from '@/components/metrics/format';
import { getSuperUserMetrics, type GuideMetrics } from '@/lib/super-user-metrics';
import { GUIDE_AUTHORING_PATH, GUIDE_EDITOR_PATH, METRICS_PATH, REFERRALS_PATH, PROFILE_PATH } from '@/utils/auth-paths';

type Profile = {
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  website_url: string | null;
  youtube_url: string | null;
};

function greeting() {
  const h = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Chicago' }));
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function initials(name: string | null, handle: string | null, email: string | undefined) {
  const src = (name ?? handle ?? email ?? '?').trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

const DEFINITIONS = {
  people_sent: 'Check-ins by someone within the attribution window after a touch from you — QR, referral or guide tap.',
  new_faces: 'Of the people you sent, those checking in at that venue for the first time.',
  guide_views: 'Opens of your published guides on happitime.biz and in the app. Tracked since Oct 2026.',
  referrals: 'Accounts created through your QR or link.',
};

export default async function SuperUserHome({ supabase, user }: { supabase: SupabaseClient; user: User }) {
  const [{ data: profileRow }, { data: m, error }] = await Promise.all([
    supabase
      .from('user_profiles')
      .select('handle, display_name, avatar_url, created_at, instagram_url, tiktok_url, website_url, youtube_url')
      .eq('user_id', user.id)
      .maybeSingle(),
    getSuperUserMetrics(supabase, '28d'),
  ]);
  const profile = (profileRow ?? {}) as Partial<Profile>;
  const name = profile.display_name ?? profile.handle ?? user.email?.split('@')[0] ?? 'there';
  const since = profile.created_at ? fmtDate(profile.created_at, { month: 'short', year: 'numeric' }) : null;
  const hasSocials = !!(profile.instagram_url || profile.tiktok_url || profile.website_url || profile.youtube_url);

  const inf = m?.influence;
  const g = m?.guides;
  const r = m?.referrals;
  const published = (g?.items ?? []).filter((x) => x.status === 'published');
  const drafts = (g?.items ?? []).filter((x) => x.status !== 'published');
  const firstWeek = !m || (m.totals.people_sent === 0 && m.totals.guide_views === 0 && m.totals.guides_published === 0);

  const peopleDelta = inf ? delta(inf.people_sent, inf.people_sent_prior) : { text: '', tone: 'none' as const };
  const facesDelta = inf ? delta(inf.new_faces, inf.new_faces_prior) : { text: '', tone: 'none' as const };
  const viewsDelta = g ? deltaPct(g.views, g.views_prior) : { text: '', tone: 'none' as const };
  const refDelta = r ? delta(r.joined, r.joined_prior) : { text: '', tone: 'none' as const };

  // "Next up" nudges — derived from the numbers, never generic.
  const nudges: { title: string; body: string; href: string }[] = [];
  if (!hasSocials) nudges.push({ title: 'Add your Instagram or TikTok', body: 'Your author page shows no socials yet.', href: PROFILE_PATH });
  if (m && m.totals.qr_scans === 0) nudges.push({ title: 'Put your QR on a table', body: 'Print it from My QR. Every scan and check-in is credited to you.', href: REFERRALS_PATH });
  const stale = published.find((p) => p.updated_at && Date.now() - new Date(p.updated_at).getTime() > 60 * 24 * 3600 * 1000);
  if (stale) nudges.push({ title: `"${stale.title}" is ${Math.floor((Date.now() - new Date(stale.updated_at!).getTime()) / 86400000)} days old`, body: 'A refresh keeps it ranking and keeps the hours right.', href: `${GUIDE_AUTHORING_PATH}` });
  if (published.length === 0) nudges.push({ title: 'Publish your first guide', body: 'Five venues is plenty. Westport and Crossroads are the most-searched right now.', href: GUIDE_EDITOR_PATH });

  return (
    <main className="max-w-[var(--width-content)] mx-auto px-6 py-8 flex flex-col gap-7">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex items-center gap-4">
          {profile.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.avatar_url} alt="" className="h-14 w-14 rounded-full object-cover bg-brand-subtle" />
          ) : (
            <div aria-hidden="true" className="h-14 w-14 rounded-full bg-brand-subtle text-brand-dark-alt flex items-center justify-center font-bold text-lg">
              {initials(profile.display_name ?? null, profile.handle ?? null, user.email)}
            </div>
          )}
          <div className="flex flex-col gap-0.5">
            <h1 className="text-display-md font-bold text-foreground tracking-tight">
              {firstWeek ? `Welcome, ${name}` : `${greeting()}, ${name}`}
            </h1>
            <p className="text-body-sm text-muted">
              {profile.handle ? `@${profile.handle}` : null}
              {profile.handle && since ? ' · ' : null}
              {since ? `Tastemaker since ${since}` : null}
              {' · Kansas City'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Link href={REFERRALS_PATH} className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-surface px-4 text-body-sm font-medium text-foreground hover:bg-background transition-colors">
            My QR
          </Link>
          <Link href={GUIDE_EDITOR_PATH} className="inline-flex h-10 items-center gap-2 rounded-md bg-dark px-4 text-body-sm font-medium text-dark-foreground hover:bg-dark/90 transition-colors">
            <span aria-hidden="true" className="text-base leading-none">+</span> New guide
          </Link>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-error bg-error-light px-4 py-3">
          <p className="text-body-sm font-medium text-error">Metrics are unavailable right now</p>
          <p className="text-body-sm text-error/80 mt-0.5">{error}</p>
        </div>
      ) : null}

      {/* First-week getting started */}
      {firstWeek && m ? (
        <section className="rounded-lg border border-border bg-surface p-6 shadow-sm flex flex-wrap items-center gap-8">
          <div className="flex-1 min-w-[280px] flex flex-col gap-2">
            <h2 className="text-heading-md font-bold text-foreground">Three things get your first numbers moving</h2>
            <p className="text-body-sm text-muted leading-relaxed">
              Your metrics start the moment someone opens a guide you wrote or scans your code. Most Tastemakers see their first &ldquo;person sent&rdquo; within two weeks of publishing.
            </p>
            {(() => {
              const steps = [hasSocials, m.totals.guides_published > 0, m.totals.qr_scans > 0];
              const done = steps.filter(Boolean).length;
              return (
                <div className="mt-1.5 flex items-center gap-3">
                  <div aria-hidden="true" className="h-1.5 flex-1 overflow-hidden rounded-full bg-brand-subtle">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${(done / 3) * 100}%` }} />
                  </div>
                  <span className="text-[13px] font-semibold text-brand-dark-alt tabular-nums whitespace-nowrap">{done} of 3</span>
                </div>
              );
            })()}
          </div>
          <ol className="flex-1 min-w-[320px] m-0 p-0 list-none flex flex-col gap-2.5">
            {[
              { done: hasSocials, title: 'Set up your profile', body: 'Add a photo and your socials so readers can find you.', href: PROFILE_PATH, cta: 'Edit' },
              { done: m.totals.guides_published > 0, title: 'Publish your first guide', body: 'Five venues is plenty. Westport and Crossroads are the most-searched right now.', href: GUIDE_EDITOR_PATH, cta: 'Start' },
              { done: m.totals.qr_scans > 0, title: 'Put your QR on a table', body: 'Print it from My QR. Every scan and check-in is credited to you.', href: REFERRALS_PATH, cta: 'Print' },
            ].map((s, i) => (
              <li key={s.title} className={`flex items-center gap-3 rounded-md border px-3.5 py-3 ${s.done ? 'border-border bg-background' : 'border-brand-light bg-surface'}`}>
                <span aria-hidden="true" className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-caption font-bold ${s.done ? 'bg-brand text-dark' : 'border-2 border-brand text-brand-dark-alt'}`}>
                  {s.done ? '✓' : i + 1}
                </span>
                <div className="flex flex-1 flex-col gap-0.5">
                  <span className={`text-body-sm font-semibold ${s.done ? 'text-muted line-through' : 'text-foreground'}`}>{s.title}</span>
                  {!s.done ? <span className="text-caption text-muted">{s.body}</span> : null}
                </div>
                {!s.done ? (
                  <Link href={s.href} className="text-[13px] font-semibold text-brand-dark-alt whitespace-nowrap">{s.cta} →</Link>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {/* Peek row */}
      <section aria-label="Last 28 days at a glance" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2 className="text-heading-sm font-semibold text-foreground">Last 28 days</h2>
          <Link href={METRICS_PATH} className="text-body-sm font-medium text-brand-dark-alt hover:underline">All metrics →</Link>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile
            label="People you sent to venues"
            value={fmtInt(inf?.people_sent ?? 0)}
            dim={!inf?.people_sent}
            note={inf?.people_sent ? peopleDelta.text : 'Counts when someone checks in after opening your guide or scanning your QR.'}
            tone={inf?.people_sent ? peopleDelta.tone : 'none'}
            href={`${METRICS_PATH}#influence`}
            info={DEFINITIONS.people_sent}
          />
          <StatTile
            label="New faces"
            value={fmtInt(inf?.new_faces ?? 0)}
            dim={!inf?.new_faces}
            note={inf?.new_faces ? facesDelta.text : 'First-time visitors to a venue, sent by you.'}
            tone={inf?.new_faces ? facesDelta.tone : 'none'}
            href={`${METRICS_PATH}#influence`}
            info={DEFINITIONS.new_faces}
          />
          <StatTile
            label="Guide views"
            value={published.length === 0 ? '—' : fmtInt(g?.views ?? 0)}
            dim={!g?.views}
            note={published.length === 0 ? 'Starts with your first published guide.' : g?.views ? viewsDelta.text : 'Tracked since Oct 2026 — shows once someone opens a guide.'}
            tone={g?.views ? viewsDelta.tone : 'none'}
            href={`${METRICS_PATH}#guides`}
            info={DEFINITIONS.guide_views}
          />
          <StatTile
            label="Referrals"
            value={fmtInt(r?.joined ?? 0)}
            dim={!r?.joined}
            note={r?.joined ? `${refDelta.text}${r.qr_scans ? ` · ${fmtInt(r.qr_scans)} QR scans` : ''}` : r?.joined_all ? `${fmtInt(r.joined_all)} all time` : 'Accounts created through your QR or link.'}
            tone={r?.joined ? refDelta.tone : 'none'}
            href={`${METRICS_PATH}#referrals`}
            info={DEFINITIONS.referrals}
          />
        </div>
      </section>

      {/* Body */}
      <div className="flex flex-wrap items-start gap-6">
        {/* Published guides */}
        <section id="guides" aria-labelledby="guides-h" className="flex-[999_1_560px] min-w-0 overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 px-5 pt-[18px] pb-3.5">
            <div className="flex flex-col gap-0.5">
              <h2 id="guides-h" className="text-heading-sm font-semibold text-foreground">Published guides</h2>
              <p className="text-[13px] text-muted">
                {published.length === 0 ? 'Nothing published yet' : `${published.length} live · sorted by views, last 28 days`}
                {drafts.length ? ` · ${drafts.length} draft${drafts.length === 1 ? '' : 's'}` : ''}
              </p>
            </div>
            <Link href={GUIDE_AUTHORING_PATH} className="text-body-sm font-medium text-muted hover:text-foreground">All guides →</Link>
          </div>

          {published.length === 0 ? (
            <div className="px-5 pb-5">
              {drafts[0] ? (
                <DraftRow draft={drafts[0]} />
              ) : (
                <div className="rounded-md border border-dashed border-border-strong bg-background p-6 text-center">
                  <p className="text-body-sm font-medium text-foreground">Your first guide starts here</p>
                  <p className="text-body-sm text-muted mt-1">Short intros, one line per spot, hours up front.</p>
                  <Link href={GUIDE_EDITOR_PATH} className="mt-4 inline-flex h-9 items-center rounded-md bg-brand px-4 text-body-sm font-semibold text-dark hover:bg-brand-hover transition-colors">New guide</Link>
                </div>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse">
                <thead>
                  <tr>
                    <th scope="col" className="text-caption font-semibold uppercase tracking-[0.06em] text-muted text-left px-4 h-11 border-b border-border whitespace-nowrap min-w-[280px]">Guide</th>
                    <th scope="col" className="text-caption font-semibold uppercase tracking-[0.06em] text-muted text-left px-4 h-11 border-b border-border whitespace-nowrap text-right">Views</th>
                    <th scope="col" className="text-caption font-semibold uppercase tracking-[0.06em] text-muted text-left px-4 h-11 border-b border-border whitespace-nowrap text-right">Venue clicks</th>
                    <th scope="col" className="text-caption font-semibold uppercase tracking-[0.06em] text-muted text-left px-4 h-11 border-b border-border whitespace-nowrap text-right">People sent</th>
                    <th scope="col" className="text-caption font-semibold uppercase tracking-[0.06em] text-muted text-left px-4 h-11 border-b border-border whitespace-nowrap hidden md:table-cell">28 days</th>
                    <th scope="col" className="text-caption font-semibold uppercase tracking-[0.06em] text-muted text-left px-4 h-11 border-b border-border whitespace-nowrap"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {published.map((p, i) => (
                    <tr key={p.guide_id} className="hover:bg-background">
                      <td className={`px-4 py-3.5 border-b border-border text-body-sm text-foreground align-middle ${i === published.length - 1 ? 'border-b-0' : ''}`}>
                        <div className="flex items-center gap-3 min-w-0">
                          {p.cover_image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.cover_image_url} alt="" className="h-11 w-11 shrink-0 rounded-md object-cover bg-brand-subtle" />
                          ) : (
                            <div aria-hidden="true" className="h-11 w-11 shrink-0 rounded-md bg-brand-subtle" />
                          )}
                          <div className="flex min-w-0 flex-col gap-0.5">
                            <Link href={`/dashboard/guides/${p.guide_id}/edit`} className="font-semibold text-foreground leading-snug hover:underline">{p.title}</Link>
                            <span className="text-caption text-muted">Published {fmtDate(p.published_at)}</span>
                          </div>
                        </div>
                      </td>
                      <td className={`px-4 py-3.5 border-b border-border text-body-sm text-foreground align-middle text-right font-semibold tabular-nums ${i === published.length - 1 ? 'border-b-0' : ''}`}>{fmtInt(p.views)}</td>
                      <td className={`px-4 py-3.5 border-b border-border text-body-sm text-foreground align-middle text-right tabular-nums ${i === published.length - 1 ? 'border-b-0' : ''}`}>{fmtInt(p.venue_clicks)}{p.ctr !== null ? <span className="text-muted"> · {fmtPct(p.ctr)}</span> : null}</td>
                      <td className={`px-4 py-3.5 border-b border-border text-body-sm text-foreground align-middle text-right font-semibold tabular-nums text-brand-dark-alt ${i === published.length - 1 ? 'border-b-0' : ''}`}>{fmtInt(p.people_sent)}</td>
                      <td className={`px-4 py-3.5 border-b border-border text-body-sm text-foreground align-middle hidden md:table-cell ${i === published.length - 1 ? 'border-b-0' : ''}`}>
                        <Sparkline values={p.daily.map((d) => d.views)} label={`Daily views for ${p.title}`} />
                      </td>
                      <td className={`px-4 py-3.5 border-b border-border text-body-sm text-foreground align-middle text-right whitespace-nowrap ${i === published.length - 1 ? 'border-b-0' : ''}`}>
                        <a href={`https://www.happitime.biz/guides/${p.slug}/`} target="_blank" rel="noreferrer" className="text-[13px] font-medium text-brand-dark-alt hover:underline">View live</a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex flex-wrap gap-4 border-t border-border px-5 py-3 text-caption text-muted">
            <span><strong className="font-semibold text-foreground">Views</strong> — opens of your guide on happitime.biz and in the app</span>
            <span><strong className="font-semibold text-foreground">People sent</strong> — check-ins after someone opened your guide in the app</span>
          </div>
        </section>

        {/* Side column */}
        <aside className="flex-[1_1_300px] min-w-0 flex flex-col gap-6">
          <section aria-labelledby="venues-h" className="rounded-lg border border-border bg-surface p-5 shadow-sm flex flex-col gap-3.5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="venues-h" className="text-heading-sm font-semibold text-foreground">Venues you&rsquo;re moving</h2>
              <span className="text-caption text-muted">28 days</span>
            </div>
            <BarList
              rows={(inf?.venues ?? []).slice(0, 5).map((v) => ({ key: v.venue_id, label: v.name, sub: v.neighborhood, value: v.people_sent, valueNote: v.new_faces ? `${v.new_faces} new` : null }))}
              emptyText="Shows up when someone checks in after a touch from you — a guide tap, a QR scan or a referral."
            />
            {(inf?.venues.length ?? 0) > 5 ? (
              <Link href={`${METRICS_PATH}#influence`} className="text-body-sm font-medium text-brand-dark-alt hover:underline">See all {inf!.venues.length} venues →</Link>
            ) : null}
          </section>

          {nudges.length ? (
            <section aria-labelledby="next-h" className="rounded-lg border border-border bg-surface p-5 shadow-sm flex flex-col gap-3">
              <h2 id="next-h" className="text-heading-sm font-semibold text-foreground">Next up</h2>
              <ul className="m-0 list-none p-0 flex flex-col gap-2.5">
                {nudges.slice(0, 3).map((n) => (
                  <li key={n.title}>
                    <Link href={n.href} className="flex flex-col gap-0.5 rounded-md border border-border bg-background px-3 py-3 hover:border-brand-light transition-colors">
                      <span className="text-body-sm font-medium text-foreground">{n.title}</span>
                      <span className="text-[13px] text-muted">{n.body}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>
    </main>
  );
}

function DraftRow({ draft }: { draft: GuideMetrics }) {
  return (
    <div className="flex flex-wrap items-center gap-3.5 rounded-md border border-border bg-background p-3.5">
      <div aria-hidden="true" className="h-12 w-12 shrink-0 rounded-md bg-brand-subtle" />
      <div className="flex min-w-[200px] flex-1 flex-col gap-0.5">
        <span className="text-body-sm font-semibold text-foreground">{draft.title}</span>
        <span className="text-caption text-muted">
          {draft.status === 'pending_review' ? 'In review' : 'Draft'}
          {draft.updated_at ? ` · edited ${fmtDate(draft.updated_at)}` : ''}
        </span>
      </div>
      <div className="flex gap-2">
        <Link href={`/dashboard/guides/${draft.guide_id}/edit`} className="inline-flex h-9 items-center rounded-md border border-border bg-surface px-3.5 text-[13px] font-medium text-foreground hover:bg-background">Keep editing</Link>
      </div>
    </div>
  );
}
