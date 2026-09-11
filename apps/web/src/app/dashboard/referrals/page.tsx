import Link from 'next/link';
import { redirect } from 'next/navigation';
import UserBar from '@/components/layout/UserBar';
import { createClient, createServiceClient } from '@/utils/supabase/server';
import { REFERRALS_PATH, loginPathFor } from '@/utils/auth-paths';
import { referralQrUrl } from '@happitime/venue-qr';
import { CopyLinkField } from './CopyLinkField';

// Super User "My QR" page: personal attribution QR + downloads + referral stats.
// The QR encodes happitime.biz/r/{handle} (apps/directory landing), which
// deep-links installed users into the app and routes new users to the stores.
// Attribution is captured in-app post-install via record_referral (first-touch,
// forge-proof) — per the Option B decision there is no install-level tracking.

export const dynamic = 'force-dynamic';

const PNG_DOWNLOADS: { preset: string; label: string; hint: string }[] = [
  { preset: 'postcard', label: 'Postcard PNG', hint: '4" · 1200px' },
  { preset: 'table_tent', label: 'Table tent PNG', hint: '3" · 900px' },
  { preset: 'coaster', label: 'Coaster PNG', hint: '2.5" · 750px' },
  { preset: 'sticker', label: 'Sticker PNG', hint: '2" · 600px' },
];

type ReferralSummaryRow = { referees: number; itinerary_saves: number };
type TrafficSummaryRow = {
  first_checkins_driven: number;
  venues_touched: number;
  redemptions_driven: number;
};

export default async function ReferralsPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) redirect(loginPathFor(REFERRALS_PATH));

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('handle, display_name')
    .eq('user_id', user.id)
    .maybeSingle();

  const handle = (profile as any)?.handle as string | null | undefined;

  // Stats via service role: the traffic view joins referees' check-ins, which
  // the Super User's own RLS context can't see (by design — they get counts,
  // never a feed of who-went-where). Self-only: filtered to auth.uid.
  let referral: ReferralSummaryRow | null = null;
  let traffic: TrafficSummaryRow | null = null;
  const service = createServiceClient();
  const [refRes, trafRes] = await Promise.all([
    service
      .from('super_user_referral_summary')
      .select('referees, itinerary_saves')
      .eq('super_user_id', user.id)
      .maybeSingle(),
    service
      .from('super_user_traffic_summary')
      .select('first_checkins_driven, venues_touched, redemptions_driven')
      .eq('super_user_id', user.id)
      .maybeSingle(),
  ]);
  referral = (refRes.data as ReferralSummaryRow | null) ?? null;
  traffic = (trafRes.data as TrafficSummaryRow | null) ?? null;

  const shareUrl = handle ? referralQrUrl(handle) : null;

  const stats = [
    { label: 'Sign-ups you drove', value: referral?.referees ?? 0 },
    { label: 'First check-ins driven', value: traffic?.first_checkins_driven ?? 0 },
    { label: 'Venues touched', value: traffic?.venues_touched ?? 0 },
    { label: 'Rounds redeemed', value: traffic?.redemptions_driven ?? 0 },
  ];

  return (
    <div className="min-h-screen bg-background">
      <UserBar />

      <main className="max-w-[var(--width-content)] mx-auto px-6 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <Link href="/dashboard" className="text-body-sm text-muted hover:text-foreground transition-colors">
              Dashboard
            </Link>
            <span className="text-muted-light">/</span>
            <span className="text-body-sm text-foreground">My QR</span>
          </div>
          <h1 className="text-display-md font-bold text-foreground tracking-tight">My QR &amp; referrals</h1>
          <p className="text-body-sm text-muted mt-1">
            Every scan of your QR carries your name. Sign-ups and check-ins it drives are credited to you — first touch, permanently.
          </p>
        </div>

        {!handle ? (
          <div className="rounded-lg border border-dashed border-border-strong bg-surface/50 p-12 text-center">
            <p className="text-body-sm font-medium text-foreground mb-1">Set your handle first</p>
            <p className="text-body-sm text-muted">
              Your QR is built from your handle. Set one in the HappiTime app (Profile → Handle), then come back here.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
            {/* QR + share link */}
            <section className="rounded-lg border border-border bg-surface shadow-sm p-6 flex flex-col items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/api/referrals/qr?size=digital&disposition=inline"
                alt={`Referral QR for @${handle}`}
                width={220}
                height={220}
                className="rounded-md border border-border bg-white p-2"
              />
              <p className="mt-3 text-body-sm font-semibold text-brand">@{handle}</p>
              <div className="mt-4 w-full">
                <CopyLinkField url={shareUrl!} />
              </div>
              <p className="mt-3 text-body-sm text-muted text-center">
                Scans open the app if it&apos;s installed, or send new people to the right app store.
              </p>
            </section>

            <div className="flex flex-col gap-6">
              {/* Stats */}
              <section>
                <h2 className="text-heading-sm font-semibold text-foreground mb-3">Your impact</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {stats.map((s) => (
                    <div key={s.label} className="rounded-lg border border-border bg-surface shadow-sm px-4 py-3">
                      <p className="text-display-sm font-bold text-foreground">{s.value}</p>
                      <p className="text-body-sm text-muted mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* Downloads */}
              <section>
                <h2 className="text-heading-sm font-semibold text-foreground mb-3">Print &amp; download</h2>
                <div className="rounded-lg border border-border bg-surface shadow-sm divide-y divide-border">
                  <div className="px-4 py-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-body-sm font-medium text-foreground">Print-ready card</p>
                      <p className="text-body-sm text-muted">4×6 PDF — hand out or post at the bar</p>
                    </div>
                    <a
                      href="/api/referrals/print?format=card"
                      className="shrink-0 inline-flex items-center justify-center h-9 px-4 rounded-md bg-brand text-white text-body-sm font-medium hover:bg-brand-dark transition-colors"
                    >
                      Download PDF
                    </a>
                  </div>
                  <div className="px-4 py-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-body-sm font-medium text-foreground">Sticker sheet</p>
                      <p className="text-body-sm text-muted">Letter PDF — six 2.5&quot; stickers with cut guides</p>
                    </div>
                    <a
                      href="/api/referrals/print?format=stickers"
                      className="shrink-0 inline-flex items-center justify-center h-9 px-4 rounded-md bg-brand text-white text-body-sm font-medium hover:bg-brand-dark transition-colors"
                    >
                      Download PDF
                    </a>
                  </div>
                  {PNG_DOWNLOADS.map((d) => (
                    <div key={d.preset} className="px-4 py-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-body-sm font-medium text-foreground">{d.label}</p>
                        <p className="text-body-sm text-muted">{d.hint} · 300 DPI</p>
                      </div>
                      <a
                        href={`/api/referrals/qr?size=${d.preset}`}
                        className="shrink-0 inline-flex items-center justify-center h-9 px-4 rounded-md border border-border bg-surface text-body-sm font-medium text-foreground hover:bg-background transition-colors"
                      >
                        Download PNG
                      </a>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
