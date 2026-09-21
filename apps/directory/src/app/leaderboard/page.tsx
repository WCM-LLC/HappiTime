import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";

const BASE = "https://happitime.biz";

export const revalidate = 900;

export const metadata: Metadata = {
  title: "Top Contributors",
  description:
    "The people keeping Kansas City happy hour listings accurate. Ranked by menus, events, and hours contributed in the last 90 days.",
  alternates: { canonical: `${BASE}/leaderboard/` },
  openGraph: {
    title: "Top Contributors | HappiTime",
    description: "The people keeping Kansas City happy hour listings accurate.",
    url: `${BASE}/leaderboard/`,
    type: "website",
    siteName: "HappiTime",
  },
};

type Row = {
  rank: number;
  handle: string;
  score: number;
  menus: number;
  windows: number;
  events: number;
  is_toastmaker: boolean;
  primary_city: string | null;
};

/** "3 menus · 2 events" — omits the zeroes so the line stays readable. */
function breakdown(r: Row): string {
  const parts: string[] = [];
  if (r.menus) parts.push(`${r.menus} menu${r.menus === 1 ? "" : "s"}`);
  if (r.events) parts.push(`${r.events} event${r.events === 1 ? "" : "s"}`);
  if (r.windows) parts.push(`${r.windows} hour${r.windows === 1 ? "" : "s"} set`);
  return parts.join(" · ");
}

export default async function LeaderboardPage() {
  // Server-side flag, deliberately not NEXT_PUBLIC_: the page is
  // server-rendered, so the value has no reason to reach the browser and an
  // unlaunched feature should not appear in the client bundle.
  if (process.env.LEADERBOARD_ENABLED !== "true") notFound();

  // The anon client, not a service-role one. contributor_scores is revoked;
  // this RPC is granted to anon and returns only publishable columns, so the
  // database is the boundary rather than this file.
  const { data, error } = await supabase.rpc("contributor_leaderboard", { p_limit: 10 });
  // Throw rather than fall through to the empty state: ISR would cache
  // "No rankings yet" for 15 minutes. A throw keeps the last good render.
  if (error) throw new Error(`contributor_leaderboard failed: ${error.message}`);
  const rows = (data ?? []) as Row[];

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold text-foreground tracking-tight">Top Contributors</h1>
      <p className="text-muted mt-2">
        The people keeping happy hour listings accurate. Ranked by what they have added in
        the last 90 days.
      </p>

      {rows.length === 0 ? (
        <div className="mt-10 rounded-lg border border-dashed border-border-strong bg-surface p-10 text-center">
          <p className="font-medium text-foreground">No rankings yet</p>
          <p className="text-muted mt-1">
            Contributions are still being published. Rankings appear here as menus and
            events go live.
          </p>
        </div>
      ) : (
        <ol className="mt-10 flex flex-col gap-3">
          {rows.map((r) => (
            <li
              key={r.handle}
              className="flex items-center gap-4 rounded-lg border border-border bg-surface px-5 py-4"
            >
              <span className="w-8 shrink-0 text-lg font-bold tabular-nums text-muted">
                {r.rank}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">@{r.handle}</span>
                  {r.is_toastmaker ? (
                    <span className="rounded-full bg-brand-subtle px-2 py-0.5 text-xs font-medium text-brand-dark">
                      Toastmaker
                    </span>
                  ) : null}
                </div>
                <div className="text-sm text-muted mt-0.5">
                  {breakdown(r)}
                  {r.primary_city ? ` · ${r.primary_city}` : ""}
                </div>
              </div>
              <span className="shrink-0 text-lg font-bold tabular-nums text-foreground">
                {r.score}
              </span>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
