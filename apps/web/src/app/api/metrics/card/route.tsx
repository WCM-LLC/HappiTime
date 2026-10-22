import { ImageResponse } from 'next/og';
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getSuperUserMetrics, parseRange } from '@/lib/super-user-metrics';
import { INTER_BOLD_TTF_BASE64, INTER_REGULAR_TTF_BASE64 } from '@/app/api/referrals/print/fonts';

// Co-branded, shareable stats card (1080×1350, Instagram feed). The Tastemaker's
// identity leads; HappiTime's wordmark and their author URL sit in the footer.
// Rendered server-side from the same super_user_metrics() read the page uses.
// Fonts are the ASCII subsets already shipped for the print PDF, so text is
// normalised to ASCII before drawing.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const W = 1080;
const H = 1350;
const COPPER = '#C8965A';
const INK = '#1A1A1A';
const CREAM = '#F5F5F3';
const MUTED = '#A3A3A3';
const RULE = '#242424';

function ascii(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .trim();
}

function fmt(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(0)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString('en-US');
}

function b64(s: string): ArrayBuffer {
  const buf = Buffer.from(s, 'base64');
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: 'authentication required' }, { status: 401 });

  const url = new URL(request.url);
  const range = parseRange(url.searchParams.get('range') ?? undefined);
  const [{ data: profile }, { data: m, error }] = await Promise.all([
    supabase.from('user_profiles').select('handle, display_name, avatar_url').eq('user_id', auth.user.id).maybeSingle(),
    getSuperUserMetrics(supabase, range),
  ]);
  if (error || !m) return NextResponse.json({ error: error ?? 'no metrics' }, { status: 500 });

  const p = (profile ?? {}) as { handle?: string | null; display_name?: string | null; avatar_url?: string | null };
  const name = ascii(p.display_name) || ascii(p.handle) || 'HappiTime Tastemaker';
  const handle = ascii(p.handle);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase() ?? '').join('') || 'HT';
  const periodLabel = (() => {
    if (range === 'all') return 'All time';
    const end = new Date(m.window_end);
    if (range === '28d') return end.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'America/Chicago' });
    return `Last ${m.range_days} days`;
  })();
  const subject = range === '7d' ? 'this week' : range === '90d' ? 'these 90 days' : range === 'all' ? 'so far' : 'this month';
  const topVenues = m.influence.venues.slice(0, 3);
  const maxVenue = Math.max(1, ...topVenues.map((v) => v.people_sent));
  const logoUrl = new URL('/brand/happitime-wordmark.png', request.url).toString();

  return new ImageResponse(
    (
      <div
        style={{
          width: W,
          height: H,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          background: INK,
          color: CREAM,
          fontFamily: 'Inter',
        }}
      >
        {/* Creator block */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            {p.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.avatar_url} width={112} height={112} style={{ width: 112, height: 112, borderRadius: 999, objectFit: 'cover', border: `4px solid ${COPPER}` }} alt="" />
            ) : (
              <div style={{ width: 112, height: 112, borderRadius: 999, background: '#F5EDE3', color: '#8B6535', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 40, border: `4px solid ${COPPER}` }}>
                {initials}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: -0.8, lineHeight: 1.1 }}>{name}</div>
              <div style={{ fontSize: 26, color: MUTED, fontWeight: 400 }}>{handle ? `@${handle} · ` : ''}Kansas City Tastemaker</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', padding: '10px 22px', borderRadius: 999, border: `2px solid ${COPPER}`, color: COPPER, fontSize: 22, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
            {periodLabel}
          </div>
        </div>

        {/* Hero */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: MUTED }}>People I sent to KC bars {subject}</div>
          <div style={{ fontSize: 300, fontWeight: 700, letterSpacing: -18, lineHeight: 0.9, color: COPPER }}>{fmt(m.influence.people_sent)}</div>
          <div style={{ display: 'flex', gap: 48, marginTop: 12 }}>
            {[
              { v: m.influence.new_faces, l: 'first-timers' },
              { v: m.influence.venues_moved, l: 'venues' },
              { v: m.guides.views, l: 'guide reads' },
            ].map((s) => (
              <div key={s.l} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontSize: 56, fontWeight: 700, letterSpacing: -1.5, lineHeight: 1 }}>{fmt(s.v)}</div>
                <div style={{ fontSize: 22, color: MUTED }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Top venues */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: MUTED }}>
            {topVenues.length ? 'Where they went' : 'Find my guides on HappiTime'}
          </div>
          {topVenues.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {topVenues.map((v, i) => (
                <div key={v.venue_id} style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                  <div style={{ width: 44, fontSize: 26, fontWeight: 700, color: COPPER }}>{i + 1}</div>
                  <div style={{ flex: 1, fontSize: 32, fontWeight: 700, display: 'flex', gap: 12, alignItems: 'baseline' }}>
                    <span>{ascii(v.name)}</span>
                    {v.neighborhood ? <span style={{ color: MUTED, fontWeight: 400, fontSize: 26 }}>{ascii(v.neighborhood)}</span> : null}
                  </div>
                  <div style={{ width: 320, height: 10, borderRadius: 999, background: RULE, display: 'flex' }}>
                    <div style={{ width: Math.max(12, (v.people_sent / maxVenue) * 320), height: 10, borderRadius: 999, background: COPPER }} />
                  </div>
                  <div style={{ width: 56, textAlign: 'right', fontSize: 32, fontWeight: 700 }}>{v.people_sent}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 28, color: CREAM, lineHeight: 1.4, maxWidth: 820 }}>
              {m.guides.published_count > 0
                ? `${m.guides.published_count} guide${m.guides.published_count === 1 ? '' : 's'} to the best happy hours in Kansas City.`
                : 'Happy hours, guides and check-ins across Kansas City.'}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, paddingTop: 36, borderTop: `2px solid ${RULE}` }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{handle ? `happitime.biz/author/${handle}` : 'happitime.biz'}</div>
            <div style={{ fontSize: 20, color: MUTED }}>Guides, happy hours and check-ins in Kansas City</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', background: '#FAFAF8', borderRadius: 16, padding: '10px 22px' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoUrl} width={230} height={72} style={{ width: 230, height: 72, objectFit: 'contain' }} alt="HappiTime" />
          </div>
        </div>
      </div>
    ),
    {
      width: W,
      height: H,
      fonts: [
        { name: 'Inter', data: b64(INTER_REGULAR_TTF_BASE64), weight: 400, style: 'normal' },
        { name: 'Inter', data: b64(INTER_BOLD_TTF_BASE64), weight: 700, style: 'normal' },
      ],
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Disposition': `inline; filename="happitime-stats-${handle || 'card'}.png"`,
      },
    },
  );
}
