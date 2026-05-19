// supabase/functions/send-friend-invite/index.ts
//
// Sends a friend invite email to a non-HappiTime user.
//
// Called by the mobile app with the authenticated user's JWT.
// Uses service_role to:
//   1. Verify the caller's JWT and fetch their profile
//   2. Rate-limit: max 20 pending invites per user per 24h
//   3. Insert a pending_friend_invites row
//   4. Send a Resend email with a deep-link invite token
//
// Set these Supabase secrets before deploying:
//   supabase secrets set RESEND_API_KEY=<key>
//   supabase secrets set RESEND_FROM=HappiTime <noreply@happitime.biz>

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const fromAddress = Deno.env.get("RESEND_FROM") ?? "HappiTime <noreply@happitime.biz>";

  if (!supabaseUrl || !serviceKey) {
    return json({ error: "Server misconfigured" }, 500);
  }

  // Authenticate the caller
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) {
    return json({ error: "Unauthorized" }, 401);
  }

  const userClient = createClient(supabaseUrl, jwt, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) {
    return json({ error: "Unauthorized" }, 401);
  }

  // Parse body
  let body: { invitee_email?: string; invitee_handle?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const inviteeEmail = (body.invitee_email ?? "").trim().toLowerCase();
  const inviteeHandle = (body.invitee_handle ?? "").trim().toLowerCase().replace(/^@/, "") || null;

  if (!isValidEmail(inviteeEmail)) {
    return json({ error: "A valid email address is required." }, 400);
  }

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // 1. Fetch inviter's handle
  const { data: profile } = await adminClient
    .from("user_profiles")
    .select("handle, display_name")
    .eq("user_id", user.id)
    .maybeSingle();

  const inviterHandle = profile?.handle ?? user.email?.split("@")[0] ?? "A friend";

  // 2. Rate limit: max 20 pending invites per user per 24h (86400s)
  const rateLimitKey = `invite:${user.id}`;
  const { data: exceeded, error: rateError } = await adminClient.rpc("check_rate_limit", {
    p_key: rateLimitKey,
    p_limit: 20,
    p_window_seconds: 86400,
  });

  if (rateError) {
    console.error("Rate limit check failed:", rateError.message);
    return json({ error: "Could not check rate limit. Try again later." }, 500);
  }
  if (exceeded) {
    return json({ error: "You've reached the daily invite limit (20). Try again tomorrow." }, 429);
  }

  // 3. Avoid duplicate pending invites for the same inviter+email combination
  const { data: existing } = await adminClient
    .from("pending_friend_invites")
    .select("id")
    .eq("inviter_id", user.id)
    .eq("invitee_email", inviteeEmail)
    .eq("status", "pending")
    .maybeSingle();

  if (existing) {
    return json({ error: "You already have a pending invite for this email." }, 409);
  }

  // 4. Insert invite row
  const { data: invite, error: insertError } = await adminClient
    .from("pending_friend_invites")
    .insert({
      inviter_id: user.id,
      invitee_email: inviteeEmail,
      invitee_handle: inviteeHandle,
    })
    .select("invite_token")
    .single();

  if (insertError || !invite) {
    console.error("Insert failed:", insertError?.message);
    return json({ error: "Failed to create invite. Please try again." }, 500);
  }

  const inviteToken = invite.invite_token as string;

  // 5. Send email via Resend
  if (!resendKey) {
    console.warn("[send-friend-invite] RESEND_API_KEY not set — email skipped");
    return json({ ok: true, email_skipped: true });
  }

  const deepLink = `happitime://invite?token=${inviteToken}`;
  const appStoreLink = "https://apps.apple.com/us/app/happitime/id6744873669";
  const subject = `@${inviterHandle} invited you to HappiTime`;
  const htmlBody = `
    <p>Hi${inviteeHandle ? ` @${inviteeHandle}` : ""},</p>
    <p><strong>@${inviterHandle}</strong> thinks you'd love HappiTime — the app for discovering happy hours and great venues.</p>
    <p>
      <a href="${deepLink}" style="display:inline-block;background:#C0773A;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;">
        Accept invitation
      </a>
    </p>
    <p style="color:#888;font-size:13px;">
      If the button doesn't open the app, download HappiTime from the
      <a href="${appStoreLink}">App Store</a> and sign up with this email address.
      You and @${inviterHandle} will be automatically connected.
    </p>
    <p style="color:#aaa;font-size:11px;">This invite expires in 30 days.</p>
  `.trim();

  const emailRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromAddress,
      to: inviteeEmail,
      subject,
      html: htmlBody,
    }),
  });

  if (!emailRes.ok) {
    const errText = await emailRes.text();
    console.error("Resend error:", errText);
    // Invite row is already inserted — return success anyway so the user isn't confused
    return json({ ok: true, email_skipped: true });
  }

  return json({ ok: true });
});
