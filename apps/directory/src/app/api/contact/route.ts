import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const MAX_SUBJECT_LENGTH = 160;
const MAX_MESSAGE_LENGTH = 4000;
const MAX_FILE_COUNT = 3;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_FILE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "text/plain",
]);
const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX_REQUESTS = 5;

function getClientId(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

function getRateLimitClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    return null;
  }

  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}

async function isRateLimited(clientId: string): Promise<boolean> {
  const supabase = getRateLimitClient();
  if (!supabase) return false;

  const { data, error } = await supabase.rpc("check_rate_limit", {
    p_key: `contact:${clientId}`,
    p_limit: RATE_LIMIT_MAX_REQUESTS,
    p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
  });

  if (error) {
    console.error("Rate limit check failed", { message: error.message });
    return false;
  }

  return data === true;
}

/**
 * Contact-form delivery goes through SMTP2GO's HTTP API rather than SMTP.
 *
 * The account's credential is an API key, and SMTP2GO's API keys are NOT SMTP
 * credentials — authenticating to mail.smtp2go.com with the key as username
 * and/or password returns "535 Incorrect authentication data". Using SMTP would
 * mean creating and rotating a second, different secret for the same provider.
 *
 * The HTTP API also suits serverless better: no long-lived socket, no SMTP
 * port to be blocked, and a synchronous per-message result we can log.
 *
 * Verified working 2026-08-12: a send from noreply@happitime.biz returned
 * {"succeeded":1,"failed":0}. The domain's SMTP2GO DKIM/return-path CNAMEs
 * have been in DNS since 2026-07-16.
 */
function getMailConfig() {
  const apiKey = process.env.SMTP2GO_API_KEY;
  const sender = process.env.SMTP2GO_SENDER ?? "HappiTime <noreply@happitime.biz>";
  const to = process.env.SUPPORT_RECIPIENT_EMAIL ?? "admin@happitime.biz";

  // Throwing keeps the existing contract: this route fails loudly with a 500
  // the visitor can see, rather than accepting the message and dropping it.
  // Silence is how the Resend outage went unnoticed for days.
  if (!apiKey || !sender || !to) {
    throw new Error("Email service is not configured.");
  }

  return { apiKey, sender, to };
}

type MailAttachment = { filename: string; fileblob: string; mimetype: string };

/** Sends via SMTP2GO and throws unless the provider confirms it took the message. */
async function sendSupportEmail(params: {
  config: { apiKey: string; sender: string; to: string };
  replyTo: string;
  subject: string;
  textBody: string;
  attachments: MailAttachment[];
}): Promise<void> {
  const res = await fetch("https://api.smtp2go.com/v3/email/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Smtp2go-Api-Key": params.config.apiKey,
    },
    body: JSON.stringify({
      sender: params.config.sender,
      to: [params.config.to],
      subject: params.subject,
      text_body: params.textBody,
      // Reply-To carries the visitor's address so a reply reaches them, while
      // the envelope stays on a domain SMTP2GO is authorised to send for.
      custom_headers: [{ header: "Reply-To", value: params.replyTo }],
      ...(params.attachments.length > 0 ? { attachments: params.attachments } : {}),
    }),
  });

  const body = await res.json().catch(() => null);
  const succeeded = body?.data?.succeeded ?? 0;

  // A 200 is not delivery: SMTP2GO reports per-recipient outcomes in the body,
  // so "accepted zero messages" must fail rather than read as success.
  if (!res.ok || succeeded < 1) {
    const reason =
      body?.data?.error ??
      body?.data?.failures?.[0] ??
      `HTTP ${res.status}, succeeded=${succeeded}`;
    throw new Error(`SMTP2GO did not accept the message: ${JSON.stringify(reason)}`);
  }
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: NextRequest) {
  try {
    if (await isRateLimited(getClientId(request))) {
      return NextResponse.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
    }

    const formData = await request.formData();
    const email = String(formData.get("email") ?? "").trim();
    const subject = String(formData.get("subject") ?? "").trim();
    const message = String(formData.get("message") ?? "").trim();
    const files = formData.getAll("attachments").filter((value): value is File => value instanceof File);

    if (!email) {
      return NextResponse.json({ error: "Your email is required." }, { status: 400 });
    }
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
    }
    if (!subject) {
      return NextResponse.json({ error: "Subject is required." }, { status: 400 });
    }
    if (!message) {
      return NextResponse.json({ error: "Message is required." }, { status: 400 });
    }
    if (subject.length > MAX_SUBJECT_LENGTH) {
      return NextResponse.json({ error: "Subject is too long." }, { status: 400 });
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json({ error: "Message is too long." }, { status: 400 });
    }
    if (files.length > MAX_FILE_COUNT) {
      return NextResponse.json({ error: `You can attach up to ${MAX_FILE_COUNT} files.` }, { status: 400 });
    }

    const attachments: MailAttachment[] = [];
    for (const file of files) {
      if (!ACCEPTED_FILE_TYPES.has(file.type)) {
        return NextResponse.json(
          { error: `Unsupported file type: ${file.name}` },
          { status: 400 },
        );
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        return NextResponse.json(
          { error: `${file.name} is too large. Max size is 5 MB per file.` },
          { status: 400 },
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      attachments.push({
        filename: file.name,
        fileblob: buffer.toString("base64"),
        mimetype: file.type,
      });
    }

    const config = getMailConfig();

    const now = new Date().toISOString();
    const userAgent = request.headers.get("user-agent") ?? "unknown";
    const referer = request.headers.get("referer") ?? "unknown";

    await sendSupportEmail({
      config,
      replyTo: email,
      subject: `[HappiTime Support] ${subject}`,
      textBody: [
        `From: ${email}`,
        `Subject: ${subject}`,
        `Timestamp: ${now}`,
        "Source app: directory (happitime.biz/contactus)",
        `Referrer: ${referer}`,
        `User-Agent: ${userAgent}`,
        "",
        "Message:",
        message,
      ].join("\n"),
      attachments,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Support request send failed", {
      message: error instanceof Error ? error.message : "Unknown error",
    });

    return NextResponse.json(
      { error: "We could not send your request right now. Please try again shortly." },
      { status: 500 },
    );
  }
}
