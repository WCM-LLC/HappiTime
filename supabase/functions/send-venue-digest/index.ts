// supabase/functions/send-venue-digest/index.ts
//
// Daily venue email: every team member of each ACTIVE (status='published')
// venue gets the day's check-in code.
//   owner / manager → full digest (code + yesterday's stats)
//   host            → code-only email
//
// Designed to be invoked hourly by a pg_cron job via pg_net.
// Auth: verified with a shared job token (x-digest-token header),
// NOT a Supabase JWT (verify_jwt = false in config.toml).
//
// The function is DST-safe: cron runs every hour; the 6 AM CT guard inside
// this function restricts actual sends to the one run that falls in the
// 6:00–6:59 AM CT window.
//
// Recipient / opt-out resolution (see recipientsForVenue in logic.ts):
//   Recipients = every org_members row with role in RECIPIENT_ROLES, one
//   email per person (highest seat wins). Email = org_members.email, falling
//   back to the auth-layer email via auth.admin.getUserById.
//   Opt-out flags honored:
//     1. organizations.notify_weekly_summary  (org-level: skips the whole venue)
//     2. user_preferences.notifications_venue_scans (per-user: skips that person)
//   A missing user_preferences row is treated as opted-in (matching track-visit).
//
// Set these Supabase secrets before deploying:
//   supabase secrets set RESEND_API_KEY=<key>
//   supabase secrets set RESEND_FROM="HappiTime <noreply@happitime.biz>"

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateCheckinCode } from "../_shared/checkin-code.ts";
import { currentQuarter } from "../_shared/quarter.ts";
import {
  buildCodeOnlyHtml,
  formatDigestSubject,
  formatHostSubject,
  isSixAmCentral,
  RECIPIENT_ROLES,
  recipientsForVenue,
  serviceDate,
  shouldAlertZeroSent,
  venuesToProcess,
  yesterdayServiceWindow,
  type MemberRow,
} from "./logic.ts";

const ADMIN_ALERT_EMAIL = "admin@happitime.biz";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const fromAddress = Deno.env.get("RESEND_FROM") ?? "HappiTime <noreply@happitime.biz>";

  if (!supabaseUrl || !serviceKey) {
    return json({ error: "Server misconfigured: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // ── 1. Auth: shared job token ────────────────────────────────────────────
  const provided = req.headers.get("x-digest-token") ?? "";
  const { data: expected, error: tokErr } = await supabase.rpc("get_digest_job_token");
  if (tokErr) return json({ error: `token lookup failed: ${tokErr.message}` }, 500);
  if (!expected || provided !== expected) return json({ error: "unauthorized" }, 401);

  // ── 2. DST-safe 6 AM CT guard ────────────────────────────────────────────
  const now = new Date();
  if (!isSixAmCentral(now)) {
    return json({ ok: true, skipped: true, reason: "not 6am CT" });
  }

  // ── 3. Compute service dates ─────────────────────────────────────────────
  const todayServiceDate = serviceDate(now);
  const { start: yesterdayStart, end: yesterdayEnd } = yesterdayServiceWindow(now);

  // ── 4. Fetch all published venues with checkin_secret + org info ─────────
  const { data: venues, error: venuesErr } = await supabase
    .from("venues")
    .select(`
      id,
      name,
      checkin_secret,
      org_id,
      organizations!inner (
        id,
        notify_weekly_summary
      )
    `)
    .eq("status", "published")
    .not("checkin_secret", "is", null);

  if (venuesErr) {
    console.error("[send-venue-digest] venues fetch failed:", venuesErr.message);
    return json({ error: venuesErr.message }, 500);
  }

  // ── 4b. Scope to venues whose org has at least one team member ───────────
  // Only venues with someone to email are processed. Without this, the loop
  // iterated EVERY published venue (~174) and exceeded the edge wall-clock
  // (504 at 6am). Members are fetched ONCE for all orgs and grouped here, so
  // the per-venue loop makes no membership queries.
  const { data: memberRows, error: membersErr } = await supabase
    .from("org_members")
    .select("org_id, user_id, email, role, created_at")
    .in("role", [...RECIPIENT_ROLES])
    .order("created_at", { ascending: true });
  if (membersErr) {
    console.error("[send-venue-digest] org_members fetch failed:", membersErr.message);
    return json({ error: membersErr.message }, 500);
  }

  type OrgMemberRow = MemberRow & { org_id: string | null };
  const allMembers = (memberRows ?? []) as OrgMemberRow[];

  const membersByOrg = new Map<string, OrgMemberRow[]>();
  for (const m of allMembers) {
    if (!m.org_id) continue;
    const list = membersByOrg.get(m.org_id) ?? [];
    list.push(m);
    membersByOrg.set(m.org_id, list);
  }

  const targetVenues = venuesToProcess(
    (venues ?? []) as { org_id: string | null }[],
    allMembers,
  ) as any[];

  const activeVenueCount = targetVenues.length;
  if (activeVenueCount === 0) {
    console.warn("[send-venue-digest] no claimed venues found — nothing to send");
    return json({ ok: true, sent: 0, active: 0 });
  }

  // ── 4c. Resolve emails and opt-outs once for everyone involved ───────────
  const targetOrgIds = new Set<string>(targetVenues.map((v: any) => v.org_id));
  const involved = allMembers.filter((m) => m.org_id != null && targetOrgIds.has(m.org_id));

  // org_members.email is sparse; fall back to the auth-layer email, once per user.
  const emailByUser = new Map<string, string | null>();
  for (const m of involved) {
    if (m.email) emailByUser.set(m.user_id, m.email);
  }
  for (const m of involved) {
    if (emailByUser.has(m.user_id)) continue;
    const { data: authUser } = await supabase.auth.admin.getUserById(m.user_id);
    emailByUser.set(m.user_id, authUser?.user?.email ?? null);
  }

  // Per-user opt-out: notifications_venue_scans === false. Missing row = opted in.
  const optedOut = new Set<string>();
  const userIds = [...new Set(involved.map((m) => m.user_id))];
  if (userIds.length > 0) {
    const { data: prefRows } = await supabase
      .from("user_preferences")
      .select("user_id, notifications_venue_scans")
      .in("user_id", userIds);
    for (const p of prefRows ?? []) {
      if (p.notifications_venue_scans === false) optedOut.add(p.user_id);
    }
  }

  // ── 5. Process each venue ────────────────────────────────────────────────
  let emailsSent = 0;
  const skippedOptOut: string[] = []; // venues skipped by the org-level flag
  let recipientsOptedOut = 0; // people skipped by the per-user flag
  const errors: string[] = [];

  for (const venue of targetVenues) {
    try {
      const org = venue.organizations;

      // Org-level opt-out: notify_weekly_summary covers the daily digest
      if (org?.notify_weekly_summary === false) {
        skippedOptOut.push(venue.id);
        continue;
      }

      // ── Who gets an email for this venue ────────────────────────────────
      const orgMembers: MemberRow[] = (membersByOrg.get(venue.org_id) ?? []).map((m) => ({
        user_id: m.user_id,
        role: m.role,
        email: emailByUser.get(m.user_id) ?? null,
      }));
      recipientsOptedOut += new Set(
        orgMembers.filter((m) => optedOut.has(m.user_id)).map((m) => m.user_id),
      ).size;
      const recipients = recipientsForVenue(orgMembers, optedOut);

      if (recipients.length === 0) {
        console.warn(`[send-venue-digest] venue ${venue.id}: no reachable team member in org ${venue.org_id} — skipping`);
        continue;
      }

      // ── Compute today's code ────────────────────────────────────────────
      const code = generateCheckinCode(String(venue.checkin_secret), todayServiceDate);

      // ── Gather yesterday's stats ────────────────────────────────────────
      // Check-in count (checkins has service_date, clean equality)
      const { count: checkinCount } = await supabase
        .from("checkins")
        .select("id", { count: "exact", head: true })
        .eq("venue_id", venue.id)
        .eq("service_date", yesterdayServiceDate(yesterdayStart));

      // First-timers vs returning: first-timers have no prior checkin before yesterday
      const { data: checkinRows } = await supabase
        .from("checkins")
        .select("user_id")
        .eq("venue_id", venue.id)
        .eq("service_date", yesterdayServiceDate(yesterdayStart));

      let firstTimers = 0;
      let returning = 0;
      if (checkinRows && checkinRows.length > 0) {
        const userIds = checkinRows.map((r: any) => r.user_id);
        // Count users whose EARLIEST checkin at this venue is yesterday
        const { data: priorRows } = await supabase
          .from("checkins")
          .select("user_id")
          .eq("venue_id", venue.id)
          .in("user_id", userIds)
          .lt("service_date", yesterdayServiceDate(yesterdayStart));
        const priorUserSet = new Set((priorRows ?? []).map((r: any) => r.user_id));
        for (const uid of userIds) {
          if (priorUserSet.has(uid)) returning++;
          else firstTimers++;
        }
      }

      // Rounds redeemed yesterday: range-filter created_at within the service-date window
      const { count: roundsRedeemed } = await supabase
        .from("round_redemptions")
        .select("id", { count: "exact", head: true })
        .eq("venue_id", venue.id)
        .gte("created_at", yesterdayStart.toISOString())
        .lt("created_at", yesterdayEnd.toISOString());

      const totalCheckins = checkinCount ?? 0;
      const totalRounds = roundsRedeemed ?? 0;

      // ── Toastmaker handle (current quarter, best-effort) ────────────────
      let toastmakerHandle: string | null = null;
      try {
        const quarter = currentQuarter(now);
        const { data: tmRow } = await supabase
          .from("venue_toastmakers")
          .select("user_id")
          .eq("venue_id", venue.id)
          .eq("quarter", quarter)
          .maybeSingle();
        if (tmRow?.user_id) {
          const { data: tmProfile } = await supabase
            .from("user_profiles")
            .select("handle")
            .eq("user_id", tmRow.user_id)
            .maybeSingle();
          toastmakerHandle = (tmProfile as { handle?: string | null } | null)?.handle ?? null;
        }
      } catch {
        // Non-critical — proceed without toastmaker line
      }

      // ── Send one email per team member via Resend ───────────────────────
      if (!resendKey) {
        console.warn("[send-venue-digest] RESEND_API_KEY not set — email skipped for venue", venue.id);
        continue;
      }

      // Built once per venue; every recipient of a kind gets the same body.
      const digestSubject = formatDigestSubject(code, totalCheckins);
      const digestHtml = buildDigestHtml({
        venueName: venue.name,
        code,
        checkinCount: totalCheckins,
        firstTimers,
        returning,
        roundsRedeemed: totalRounds,
        serviceDate: yesterdayServiceDate(yesterdayStart),
        toastmakerHandle,
      });
      const hostSubject = formatHostSubject(code, venue.name);
      const hostHtml = buildCodeOnlyHtml({ venueName: venue.name, code });

      for (const r of recipients) {
        const isDigest = r.kind === "digest";
        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: fromAddress,
            to: r.email,
            subject: isDigest ? digestSubject : hostSubject,
            html: isDigest ? digestHtml : hostHtml,
          }),
        });

        if (!emailRes.ok) {
          const errText = await emailRes.text();
          console.error(`[send-venue-digest] Resend error for venue ${venue.id} user ${r.userId}:`, errText);
          errors.push(`venue:${venue.id}:user:${r.userId}:resend_error`);
        } else {
          emailsSent++;
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[send-venue-digest] unexpected error for venue ${venue.id}:`, msg);
      errors.push(`venue:${venue.id}:${msg}`);
    }
  }

  // ── 6. Zero-email self-check (only evaluated AFTER the 6am guard passes) ─
  if (shouldAlertZeroSent(emailsSent, activeVenueCount)) {
    const alertMsg = `[send-venue-digest] ALERT: 0 emails sent but ${activeVenueCount} active venue(s) exist. Possible misconfiguration. Date=${todayServiceDate} skipped=${skippedOptOut.length} errors=${errors.length}`;
    console.error(alertMsg);

    // Best-effort admin notification via Resend
    if (resendKey) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromAddress,
          to: ADMIN_ALERT_EMAIL,
          subject: `[HappiTime ALERT] send-venue-digest sent 0 emails (${activeVenueCount} active venues)`,
          html: `<pre>${alertMsg}\n\nErrors:\n${errors.join("\n")}</pre>`,
        }),
      }).catch((e) => console.error("[send-venue-digest] admin alert send failed:", e));
    }

    return json({ error: "zero_emails_sent", active: activeVenueCount, skipped: skippedOptOut.length, errors }, 500);
  }

  return json({
    ok: true,
    sent: emailsSent,
    active: activeVenueCount,
    skipped_opt_out: skippedOptOut.length,
    recipients_opt_out: recipientsOptedOut,
    errors: errors.length > 0 ? errors : undefined,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Extract YYYY-MM-DD from yesterday's start Date (which is yesterday 06:00 CT in UTC). */
function yesterdayServiceDate(yesterdayStart: Date): string {
  // yesterdayStart is in UTC. We want the service date string = the CT calendar
  // day that started at this moment. Since it's 06:00 CT, subtracting 6h would
  // give us midnight CT but serviceDate() subtracts 6h then formats CT — this
  // is circular. Simplest: add 1 hour to get 07:00 CT = a moment definitely in
  // the right CT calendar day, then use serviceDate().
  const midMorning = new Date(yesterdayStart.getTime() + 3600_000);
  return serviceDate(midMorning);
}

function buildDigestHtml(args: {
  venueName: string;
  code: string;
  checkinCount: number;
  firstTimers: number;
  returning: number;
  roundsRedeemed: number;
  serviceDate: string;
  toastmakerHandle?: string | null;
}): string {
  const { venueName, code, checkinCount, firstTimers, returning, roundsRedeemed, serviceDate: yd, toastmakerHandle } = args;
  const toastmakerLine = toastmakerHandle
    ? `<p style="margin:12px 0 0;font-size:13px;color:#C0773A;font-weight:600">🥂 This quarter's Toastmaker: @${toastmakerHandle}</p>`
    : "";
  return `
<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
  <h2 style="color:#C0773A;margin-bottom:4px">HappiTime Daily Digest</h2>
  <p style="color:#555;margin-top:0">${venueName} — ${yd}</p>

  <div style="background:#f9f5ef;border-radius:12px;padding:20px 24px;margin:20px 0;text-align:center">
    <p style="margin:0 0 4px;color:#888;font-size:13px;text-transform:uppercase;letter-spacing:1px">Today's Check-In Code</p>
    <p style="margin:0;font-size:40px;font-weight:700;letter-spacing:6px;color:#1a1a1a;font-family:monospace">${code}</p>
    <p style="margin:8px 0 0;color:#aaa;font-size:12px">Post this at your bar — valid until 6 AM tomorrow (CT)</p>
  </div>

  <h3 style="color:#333;border-bottom:1px solid #eee;padding-bottom:8px">Yesterday's Stats</h3>
  <table style="width:100%;border-collapse:collapse">
    <tr>
      <td style="padding:8px 0;color:#555">Total check-ins</td>
      <td style="padding:8px 0;text-align:right;font-weight:700;color:#1a1a1a">${checkinCount}</td>
    </tr>
    <tr>
      <td style="padding:8px 0;color:#555">First-timers</td>
      <td style="padding:8px 0;text-align:right;font-weight:700;color:#C0773A">${firstTimers}</td>
    </tr>
    <tr>
      <td style="padding:8px 0;color:#555">Returning guests</td>
      <td style="padding:8px 0;text-align:right;font-weight:700;color:#1a1a1a">${returning}</td>
    </tr>
    <tr>
      <td style="padding:8px 0;color:#555">Rounds redeemed</td>
      <td style="padding:8px 0;text-align:right;font-weight:700;color:#1a1a1a">${roundsRedeemed}</td>
    </tr>
  </table>
  ${toastmakerLine}

  <p style="margin-top:20px">
    <a href="https://happitime-console.vercel.app/dashboard?utm_source=venue_digest&utm_medium=email"
       style="display:inline-block;background:#C0773A;color:#fff;text-decoration:none;font-weight:700;font-size:13px;padding:10px 18px;border-radius:999px">
      Manage your listing
    </a>
  </p>

  <p style="color:#aaa;font-size:11px;margin-top:24px;border-top:1px solid #eee;padding-top:12px">
    You're receiving this because you're an owner or manager of ${venueName} on HappiTime.
    To update notification preferences, visit your venue dashboard.
  </p>
</div>
  `.trim();
}
