// supabase/functions/send-venue-digest/index.ts
//
// Daily venue digest email: sends each ACTIVE (status='published') venue's
// owner the day's check-in code + yesterday's stats.
//
// Designed to be invoked hourly by a pg_cron job via pg_net.
// Auth: verified with a shared job token (x-digest-token header),
// NOT a Supabase JWT (verify_jwt = false in config.toml).
//
// The function is DST-safe: cron runs every hour; the 6 AM CT guard inside
// this function restricts actual sends to the one run that falls in the
// 6:00–6:59 AM CT window.
//
// Recipient / opt-out resolution:
//   Recipient email = earliest org "owner" (fallback: earliest "manager")
//   resolved via auth.admin.getUserById, using org_members.email as a first
//   preference before falling back to the auth-layer email.
//   Opt-out flags honored (both must be true to send):
//     1. organizations.notify_weekly_summary  (org-level daily-summary opt-in)
//     2. user_preferences.notifications_venue_scans (per-user venue-team notification opt-in)
//   A missing user_preferences row is treated as opted-in (matching track-visit).
//
// Set these Supabase secrets before deploying:
//   supabase secrets set RESEND_API_KEY=<key>
//   supabase secrets set RESEND_FROM="HappiTime <noreply@happitime.biz>"

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateCheckinCode } from "../_shared/checkin-code.ts";
import {
  serviceDate,
  formatDigestSubject,
  isSixAmCentral,
  shouldAlertZeroSent,
  venuesToProcess,
  yesterdayServiceWindow,
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

  // ── 4b. Scope to venues whose org has an owner/manager ───────────────────
  // Only claimed venues can receive a digest (the recipient is the owner/manager).
  // Without this, the loop iterated EVERY published venue (~174) — one serial
  // org_members lookup each — and exceeded the edge wall-clock (504 at 6am).
  const { data: ownerManagerMembers, error: membersErr } = await supabase
    .from("org_members")
    .select("org_id")
    .in("role", ["owner", "manager"]);
  if (membersErr) {
    console.error("[send-venue-digest] org_members fetch failed:", membersErr.message);
    return json({ error: membersErr.message }, 500);
  }

  const targetVenues = venuesToProcess(
    (venues ?? []) as { org_id: string | null }[],
    ownerManagerMembers ?? [],
  ) as any[];

  const activeVenueCount = targetVenues.length;
  if (activeVenueCount === 0) {
    console.warn("[send-venue-digest] no claimed venues found — nothing to send");
    return json({ ok: true, sent: 0, active: 0 });
  }

  // ── 5. Process each venue ────────────────────────────────────────────────
  let emailsSent = 0;
  const skippedOptOut: string[] = [];
  const errors: string[] = [];

  for (const venue of targetVenues) {
    try {
      const org = venue.organizations;

      // Org-level opt-out: notify_weekly_summary covers the daily digest
      if (org?.notify_weekly_summary === false) {
        skippedOptOut.push(venue.id);
        continue;
      }

      // ── Find the org owner (fallback: manager) ──────────────────────────
      const { data: members } = await supabase
        .from("org_members")
        .select("user_id, email, role, created_at")
        .eq("org_id", venue.org_id)
        .in("role", ["owner", "manager"])
        .order("created_at", { ascending: true });

      if (!members || members.length === 0) {
        console.warn(`[send-venue-digest] venue ${venue.id}: no owner/manager in org ${venue.org_id} — skipping`);
        continue;
      }

      // Prefer owner; fall back to manager
      const owner = members.find((m: any) => m.role === "owner") ?? members[0];
      const userId: string = owner.user_id;

      // ── Resolve recipient email ─────────────────────────────────────────
      // org_members.email is sparse; fall back to auth user email
      let recipientEmail: string | null = owner.email ?? null;
      if (!recipientEmail) {
        const { data: authUser } = await supabase.auth.admin.getUserById(userId);
        recipientEmail = authUser?.user?.email ?? null;
      }

      if (!recipientEmail) {
        console.warn(`[send-venue-digest] venue ${venue.id}: could not resolve email for user ${userId} — skipping`);
        continue;
      }

      // ── Per-user opt-out: notifications_venue_scans ─────────────────────
      const { data: prefs } = await supabase
        .from("user_preferences")
        .select("notifications_venue_scans")
        .eq("user_id", userId)
        .maybeSingle();

      // Missing row = opted in (matches track-visit convention)
      if (prefs?.notifications_venue_scans === false) {
        skippedOptOut.push(venue.id);
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

      // ── Send email via Resend ───────────────────────────────────────────
      if (!resendKey) {
        console.warn("[send-venue-digest] RESEND_API_KEY not set — email skipped for venue", venue.id);
        continue;
      }

      const subject = formatDigestSubject(code, totalCheckins);
      const htmlBody = buildDigestHtml({
        venueName: venue.name,
        code,
        checkinCount: totalCheckins,
        firstTimers,
        returning,
        roundsRedeemed: totalRounds,
        serviceDate: yesterdayServiceDate(yesterdayStart),
      });

      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromAddress,
          to: recipientEmail,
          subject,
          html: htmlBody,
        }),
      });

      if (!emailRes.ok) {
        const errText = await emailRes.text();
        console.error(`[send-venue-digest] Resend error for venue ${venue.id}:`, errText);
        errors.push(`venue:${venue.id}:resend_error`);
      } else {
        emailsSent++;
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
}): string {
  const { venueName, code, checkinCount, firstTimers, returning, roundsRedeemed, serviceDate: yd } = args;
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

  <p style="color:#aaa;font-size:11px;margin-top:24px;border-top:1px solid #eee;padding-top:12px">
    You're receiving this because you're an owner or manager of ${venueName} on HappiTime.
    To update notification preferences, visit your venue dashboard.
  </p>
</div>
  `.trim();
}
