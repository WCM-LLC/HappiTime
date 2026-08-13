/**
 * POST /api/intake/extract
 *
 * Multipart body: { image: File, venue_name?: string }
 * Server runs a vision model on the image and returns a draft of
 * happy_hour_windows + happy_hour_offers ready for review.
 *
 * Auth: cookie session (console) or bearer token (HappiTime app). Admins are
 * uncapped; owners and super users get INTAKE_DAILY_EXTRACT_CAP scans a day.
 *
 * Provider selection: INTAKE_VISION_PROVIDER = 'gemini' (default) | 'anthropic'
 *   - gemini    → Google Gemini Flash. Free tier: 15 RPM, 1,500/day.
 *                 Required env: GOOGLE_AI_API_KEY (or GEMINI_API_KEY)
 *                 Bonus: handles HEIC/HEIF natively.
 *   - anthropic → Claude Sonnet vision. Requires paid API billing.
 *                 Required env: ANTHROPIC_API_KEY
 *
 * Per-provider model default can be overridden with INTAKE_MODEL.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/utils/supabase/server';
import { authenticateIntakeRequest } from '@/utils/intake-auth';
import { EVENT_TYPES, DATE_RE, normalizeContentType } from '@/utils/intake-content';
import {
  getIntakeTier,
  extractsUsedToday,
  INTAKE_DAILY_EXTRACT_CAP,
} from '@/utils/intake-access';

export const runtime = 'nodejs';
// This route waits synchronously on a vision-LLM round-trip. The internal
// per-provider abort is ~45s (see INTAKE_*_TIMEOUT_MS below), and the client
// upload (up to 8 MB) is also spent on the invocation clock. maxDuration MUST
// sit ABOVE the largest internal timeout, or Vercel kills the function first
// and you get a generic FUNCTION_INVOCATION_TIMEOUT instead of our own error.
// 60s is the universally-legal ceiling (Hobby cap); raise toward 300 on Pro.
export const maxDuration = 60;

type Provider = 'gemini' | 'anthropic';

const PROVIDER: Provider = (process.env.INTAKE_VISION_PROVIDER as Provider) || 'gemini';
const DEFAULT_MODELS: Record<Provider, string> = {
  // gemini-2.0-flash was retired for new users in early 2026. 2.5-flash is the
  // current vision-capable Flash model and stays inside the free tier.
  // Override with INTAKE_MODEL if Google publishes a newer alias.
  gemini: 'gemini-2.5-flash',
  anthropic: 'claude-sonnet-4-6',
};
const MODEL = process.env.INTAKE_MODEL || DEFAULT_MODELS[PROVIDER];
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB upload cap
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

const SYSTEM_PROMPT = `You are an extraction agent for HappiTime. You receive a
photo of bar/restaurant content — a menu, chalkboard, table tent, sandwich
board, event flyer, or printed sign — and you extract EVERYTHING relevant into
a strict JSON shape that matches HappiTime's data model.

FIRST decide what you are looking at, then extract accordingly. A recurring
happy hour and a one-off event are different things in HappiTime and are
stored differently, so this classification matters more than any single field.
A human confirms your answer before anything is saved, so say what you actually
see and use "unknown" when the photo does not tell you.

Return STRICT JSON in this exact shape, no markdown, no commentary:

{
  "content_type": "happy_hour" | "event" | "event_series" | "mixed" | "unknown",
  "events": [
    {
      "title": "Trivia Night",
      "description": null,
      "event_type": "trivia",
      "date": "2026-08-21",
      "start_time": "19:00",
      "end_time": "21:00",
      "is_recurring": false,
      "recurrence_dow": [],
      "price_info": "$5 cover"
    }
  ],
  "windows": [
    { "dow": [1,2,3,4,5], "start_time": "15:00", "end_time": "18:00", "label": "Weekday Happy Hour" }
  ],
  "menu": {
    "name": "Happy Hour",
    "sections": [
      {
        "name": "Eats",
        "items": [
          { "name": "Chicken Satay", "price": 3.00, "description": null }
        ]
      },
      {
        "name": "Drinks",
        "items": [
          { "name": "All Drafts", "price": null, "description": "$2 off" }
        ]
      }
    ]
  },
  "_confidence": "high" | "medium" | "low",
  "_notes": "short string for any ambiguity"
}

CLASSIFICATION RULES (decide this first):
- "happy_hour": recurring discounted food/drink tied to times of day. Words
  like "Happy Hour", "Daily Specials", "3-6pm", "$2 off drafts". This is the
  default for a menu board with prices and a time range.
- "event": ONE dated thing. A specific calendar date, or a named one-off
  ("Aug 21", "this Saturday", "Oktoberfest Kickoff").
- "event_series": something that repeats on a weekday without being a happy
  hour — "Trivia every Thursday", "Live Music Fridays", "Sunday Funday".
- "mixed": the image clearly shows BOTH a happy hour AND one or more events.
  Fill in windows/menu AND events, and say so in "_notes".
- "unknown": you cannot tell (a plain food menu with no times, a logo, a photo
  of a room). Return empty arrays and explain in "_notes". Do NOT guess
  "happy_hour" just because it is a bar.
- Discounted drinks during a named event are still an event, not a happy hour,
  when the drinks exist because of the event ("Game Day: $3 drafts").

EVENTS RULES (extract IFF content_type is event, event_series, or mixed):
- "title": the event's name as printed. Required.
- "event_type": one of "event", "special", "live_music", "trivia", "sports",
  "other". Pick the closest; use "event" when nothing fits.
- "date": "YYYY-MM-DD" ONLY when a specific calendar date is visible. Use null
  for anything recurring or undated. Never infer a date from a weekday name,
  and never assume the current year unless the sign prints it.
- "start_time" / "end_time": 24-hour HH:MM, same as windows. Use null for
  end_time when only a start is shown.
- "is_recurring": true for anything that repeats ("every Thursday", "Fridays").
- "recurrence_dow": the weekdays it repeats on, 0=Sunday .. 6=Saturday. Empty
  array when it does not recur. Do NOT write a recurrence rule string.
- "price_info": free text exactly as printed ("$5 cover", "Free", "No cover").
  Use null when no price is shown.
- Return one entry per distinct event. A flyer listing a week of shows is one
  entry per show, not one entry for the week.

GENERAL RULES:
- Extract EVERY field you can see in the image. The UI handles missing fields
  gracefully — empty arrays are fine where data isn't visible.
- Do NOT invent items, prices, or times. If unsure, leave it out and explain
  in "_notes" (e.g. "end time partially obscured").
- Output JSON only. No markdown fences. No commentary.

WINDOWS RULES (extract IFF time information is visible in the image):
- "dow": 0=Sunday .. 6=Saturday. Use the smallest correct set
  (e.g. "Tue-Fri" → [2,3,4,5]; "Daily" → [0,1,2,3,4,5,6]).
- "start_time" / "end_time": 24-hour HH:MM (e.g. "4pm" → "16:00",
  "midnight" → "00:00").
- "label": optional short tag visible on the sign (e.g. "Late Night",
  "Weekday HH"). Use null if not present.
- If the image shows multiple distinct windows (e.g. "Mon-Fri 3-6pm" AND
  "Sat-Sun all day"), return one entry per window.
- If NO time info is visible, return windows: [] and let the operator pick.

MENU RULES (extract IFF menu items are visible):
- The menu "name" is almost always "Happy Hour". Use something else only if
  the photo clearly says e.g. "Late Night Menu".
- Section names: "Eats" + "Drinks" (HappiTime convention). Use other names
  (e.g. "Cocktails", "Wine", "Bites") only if the menu uses them explicitly.
- One item per row. If the menu lists 10 different "$3" items, emit 10
  rows each priced at 3.
- "price": decimal number if a specific price is shown, otherwise null.
- "description": optional. Use for modifiers ("frozen or rocks") or
  discount-style items where the deal is "X off" instead of a fixed dollar
  ({ name: "All Drafts", price: null, description: "$2 off" }).
- If no menu content visible, return menu.sections: [].

WINDOWS vs EVENTS:
- Never put an event's hours in "windows". Windows are happy-hour times only.
- When content_type is "event" or "event_series", windows and menu.sections
  are normally empty — put the timing on the event entry instead.`;

function buildUserPrompt(venueName?: string): string {
  const task =
    'Classify what this image shows, then extract it: happy-hour windows and ' +
    'menu, and/or events.';
  return venueName ? `Venue: ${venueName}. ${task}` : task;
}

/**
 * The provider key was never configured, so no model was ever called.
 *
 * This is NOT `extract_failed`. That code means "the model looked at the photo
 * and could not do it", and both clients render it as advice to re-shoot the
 * photo. A missing key rendered as bad-photo advice sends the operator out to
 * photograph the same menu again, which can never work. Typed rather than
 * string-matched so rewording the message can't silently reclassify it.
 */
class VisionNotConfiguredError extends Error {
  constructor(envVar: string) {
    super(`${envVar} not configured`);
    this.name = 'VisionNotConfiguredError';
  }
}

function stripFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
}

// ─── Provider: Anthropic Claude ─────────────────────────────────────────────

async function callClaudeVision(base64Image: string, mediaType: string, venueName?: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new VisionNotConfiguredError('ANTHROPIC_API_KEY');

  // Bound the call the same way the Gemini path is bounded. Without this, a
  // stalled Claude response hangs until fetch's own default (~5 min), which
  // always overruns maxDuration and surfaces as FUNCTION_INVOCATION_TIMEOUT.
  // Keep this comfortably under maxDuration (60s) so OUR error wins the race.
  const controller = new AbortController();
  const timeoutMs = Number(process.env.INTAKE_ANTHROPIC_TIMEOUT_MS ?? 45_000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Image } },
              { type: 'text', text: buildUserPrompt(venueName) },
            ],
          },
        ],
      }),
    });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error(
        `Anthropic call timed out after ${timeoutMs}ms. Image was ${Math.round(base64Image.length / 1024)}KB base64 — try a smaller image, or bump INTAKE_ANTHROPIC_TIMEOUT_MS.`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Anthropic API ${res.status}: ${body.slice(0, 400)}`);
  }
  const data = await res.json();
  const text: string = data?.content?.[0]?.text ?? '';
  return { parsed: JSON.parse(stripFences(text)), usage: data?.usage ?? null };
}

// ─── Provider: Google Gemini ────────────────────────────────────────────────

async function callGeminiVision(base64Image: string, mediaType: string, venueName?: string) {
  const apiKey = process.env.GOOGLE_AI_API_KEY ?? process.env.GEMINI_API_KEY;
  if (!apiKey) throw new VisionNotConfiguredError('GOOGLE_AI_API_KEY');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent?key=${apiKey}`;

  // 45s timeout — Flash usually returns in 2-5s; anything past 45s is a stall.
  // Without this the request can hang for 70+ seconds before fetch gives up.
  const controller = new AbortController();
  const timeoutMs = Number(process.env.INTAKE_GEMINI_TIMEOUT_MS ?? 45_000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [
          {
            role: 'user',
            parts: [
              { inline_data: { mime_type: mediaType, data: base64Image } },
              { text: buildUserPrompt(venueName) },
            ],
          },
        ],
        generationConfig: {
          // Force pure JSON output — no markdown fence stripping needed.
          responseMimeType: 'application/json',
          // 8192 is Flash's max; output token count does NOT affect free-tier
          // rate limits (those are per-request). Dense menus need this much.
          maxOutputTokens: 8192,
          temperature: 0.1,
        },
      }),
    });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error(
        `Gemini upload timed out after ${timeoutMs}ms. Image was ${Math.round(base64Image.length / 1024)}KB base64 — try a smaller image, or bump INTAKE_GEMINI_TIMEOUT_MS.`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Gemini API ${res.status}: ${body.slice(0, 400)}`);
  }
  const data = await res.json();
  const text: string =
    data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? '').join('') ?? '';
  const finishReason: string | undefined = data?.candidates?.[0]?.finishReason;

  if (!text) {
    throw new Error(`Gemini returned empty content. Raw: ${JSON.stringify(data).slice(0, 300)}`);
  }
  // Gemini may still wrap in fences if its safety/JSON modes disagree — guard anyway.
  let parsed: any;
  try {
    parsed = JSON.parse(stripFences(text));
  } catch (err: any) {
    // Most common cause of a JSON parse failure here is output truncation
    // (model hit maxOutputTokens mid-string). Surface that explicitly so
    // the user knows whether to bump the budget or retry.
    const truncated = finishReason === 'MAX_TOKENS' || finishReason === 'LENGTH';
    const head = text.slice(0, 160).replace(/\s+/g, ' ');
    const tail = text.slice(-160).replace(/\s+/g, ' ');
    throw new Error(
      truncated
        ? `Gemini output was truncated at ${text.length} chars (finishReason=${finishReason}). The menu may be too dense for current maxOutputTokens; the head was "${head}…" and tail was "…${tail}".`
        : `Failed to parse Gemini JSON (${err?.message ?? 'unknown'}). finishReason=${finishReason ?? 'none'}, length=${text.length}. Head: "${head}…"`,
    );
  }

  // Normalize usage into the same shape we use for Anthropic, so the rest
  // of the app doesn't care which provider answered.
  const um = data?.usageMetadata;
  const usage = um
    ? { input_tokens: um.promptTokenCount ?? null, output_tokens: um.candidatesTokenCount ?? null }
    : null;

  return { parsed, usage };
}

// ─── Dispatch ───────────────────────────────────────────────────────────────

async function runVisionExtract(base64Image: string, mediaType: string, venueName?: string) {
  switch (PROVIDER) {
    case 'gemini':
      return callGeminiVision(base64Image, mediaType, venueName);
    case 'anthropic':
      return callClaudeVision(base64Image, mediaType, venueName);
    default:
      throw new Error(`Unsupported INTAKE_VISION_PROVIDER: ${PROVIDER as string}`);
  }
}

// ─── Validation ─────────────────────────────────────────────────────────────

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function validate(draft: any): string[] {
  const errors: string[] = [];

  // Events: optional, but a malformed entry must not reach the review step
  // pretending to be a real date or a real recurrence.
  const events = Array.isArray(draft?.events) ? draft.events : [];
  events.forEach((e: any, i: number) => {
    if (typeof e?.title !== 'string' || !e.title.trim()) errors.push(`events[${i}].title required`);
    if (e?.event_type != null && !(EVENT_TYPES as readonly string[]).includes(e.event_type))
      errors.push(`events[${i}].event_type must be one of ${EVENT_TYPES.join(', ')}`);
    if (e?.date != null && (typeof e.date !== 'string' || !DATE_RE.test(e.date)))
      errors.push(`events[${i}].date must be YYYY-MM-DD or null`);
    if (typeof e?.start_time !== 'string' || !TIME_RE.test(e.start_time))
      errors.push(`events[${i}].start_time invalid`);
    if (e?.end_time != null && (typeof e.end_time !== 'string' || !TIME_RE.test(e.end_time)))
      errors.push(`events[${i}].end_time must be HH:MM or null`);
    const dow = Array.isArray(e?.recurrence_dow) ? e.recurrence_dow : [];
    if (dow.some((d: any) => !Number.isInteger(d) || d < 0 || d > 6))
      errors.push(`events[${i}].recurrence_dow must be 0-6`);
    // A recurring event with no weekday is unschedulable, and a one-off with
    // neither a date nor a weekday cannot be placed on a calendar at all.
    if (e?.is_recurring && dow.length === 0)
      errors.push(`events[${i}] is recurring but has no recurrence_dow`);
    if (!e?.is_recurring && e?.date == null)
      errors.push(`events[${i}] needs a date (or mark it recurring)`);
  });

  // Windows: every entry that's present must be well-formed. Empty array OK.
  const windows = Array.isArray(draft?.windows) ? draft.windows : [];
  windows.forEach((w: any, i: number) => {
    if (!Array.isArray(w.dow) || w.dow.length === 0) errors.push(`windows[${i}].dow missing`);
    else if (w.dow.some((d: any) => !Number.isInteger(d) || d < 0 || d > 6))
      errors.push(`windows[${i}].dow must be 0-6`);
    if (typeof w.start_time !== 'string' || !TIME_RE.test(w.start_time))
      errors.push(`windows[${i}].start_time invalid`);
    if (typeof w.end_time !== 'string' || !TIME_RE.test(w.end_time))
      errors.push(`windows[${i}].end_time invalid`);
  });

  // Menu: optional but if present, well-formed.
  const menu = draft?.menu;
  if (menu != null) {
    if (typeof menu !== 'object') {
      errors.push('menu must be an object if present');
    } else {
      if (typeof menu.name !== 'string' || !menu.name.trim()) errors.push('menu.name required');
      const sections = Array.isArray(menu.sections) ? menu.sections : [];
      sections.forEach((s: any, si: number) => {
        if (typeof s.name !== 'string' || !s.name.trim())
          errors.push(`menu.sections[${si}].name required`);
        const items = Array.isArray(s.items) ? s.items : [];
        items.forEach((it: any, ii: number) => {
          if (typeof it.name !== 'string' || !it.name.trim())
            errors.push(`menu.sections[${si}].items[${ii}].name required`);
          if (
            it.price != null &&
            (typeof it.price !== 'number' || !Number.isFinite(it.price) || it.price < 0)
          )
            errors.push(`menu.sections[${si}].items[${ii}].price must be a non-negative number or null`);
        });
      });
    }
  }

  return errors;
}

// ─── Route handler ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const caller = await authenticateIntakeRequest(req);
  if (!caller) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { supabase, user } = caller;
  const tier = await getIntakeTier(supabase, user);
  if (!tier) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  // Owner/super tiers ride the Gemini free tier — cap extracts per service day.
  if (tier !== 'admin') {
    const used = await extractsUsedToday(user.id);
    if (used >= INTAKE_DAILY_EXTRACT_CAP) {
      return NextResponse.json(
        {
          error: 'daily_limit_reached',
          detail: `You've used all ${INTAKE_DAILY_EXTRACT_CAP} menu scans for today — the counter resets at midnight. Your saved drafts are still there.`,
        },
        { status: 429 },
      );
    }
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'invalid_multipart' }, { status: 400 });
  }

  const image = form.get('image');
  const venueName = (form.get('venue_name') as string | null) || undefined;

  if (!(image instanceof File)) {
    return NextResponse.json({ error: 'image_required' }, { status: 400 });
  }
  if (image.size > MAX_BYTES) {
    return NextResponse.json({ error: 'image_too_large', max_bytes: MAX_BYTES }, { status: 413 });
  }
  if (!ALLOWED_MIME.has(image.type)) {
    return NextResponse.json({ error: 'unsupported_image_type', got: image.type }, { status: 415 });
  }

  const buf = Buffer.from(await image.arrayBuffer());
  const base64 = buf.toString('base64');

  const extractStartedAt = Date.now();
  try {
    const { parsed, usage } = await runVisionExtract(base64, image.type, venueName);
    const errors = validate(parsed);
    // Feed the daily cap + the provider/latency log (analytics feeds off this).
    try {
      await createServiceClient().from('intake_extract_log').insert({
        user_id: user.id,
        provider: PROVIDER,
        latency_ms: Date.now() - extractStartedAt,
      });
    } catch (logErr) {
      console.error('[intake/extract] extract_log_insert_failed:', logErr);
    }
    return NextResponse.json({
      ok: errors.length === 0,
      // The label the model proposed, normalized. The review step shows this
      // for a human to confirm or change — nothing commits on it alone.
      content_type: normalizeContentType((parsed as any)?.content_type),
      draft: parsed,
      validation: { errors },
      usage,
      provider: PROVIDER,
      model: MODEL,
    });
  } catch (err: any) {
    console.error('[intake/extract] failed:', {
      message: err?.message ?? String(err),
      provider: PROVIDER,
      model: MODEL,
      imageType: image.type,
      imageBytes: image.size,
      hasGeminiKey: Boolean(process.env.GOOGLE_AI_API_KEY ?? process.env.GEMINI_API_KEY),
      hasAnthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
    });

    // No key means we never called a model, so nothing about the photo is at
    // fault. 503 + its own code, mirroring `service_role_missing`, keeps the
    // operator from being told to re-shoot a photo that was always fine.
    if (err instanceof VisionNotConfiguredError) {
      return NextResponse.json(
        {
          error: 'vision_not_configured',
          detail: `Menu scanning isn't configured on the server (${err.message}). Photos are fine — this needs an operator to set the key.`,
          provider: PROVIDER,
        },
        { status: 503 },
      );
    }

    // `detail` — not `message` — is the field both clients read and every
    // other intake route returns. Sending `message` here silently discarded
    // the reason and left the user with a bare "extract_failed".
    return NextResponse.json(
      {
        error: 'extract_failed',
        provider: PROVIDER,
        model: MODEL,
        detail: err?.message ?? String(err),
      },
      { status: 502 },
    );
  }
}
