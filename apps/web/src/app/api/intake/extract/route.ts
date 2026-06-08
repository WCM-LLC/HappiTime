/**
 * POST /api/intake/extract
 *
 * Multipart body: { image: File, venue_name?: string }
 * Server runs a vision model on the image and returns a draft of
 * happy_hour_windows + happy_hour_offers ready for review.
 *
 * Auth: requires an authenticated user who is in the platform admin list.
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
import { createClient } from '@/utils/supabase/server';
import { isAdminEmail } from '@/utils/admin-emails';

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
photo of bar/restaurant happy-hour content — a menu, chalkboard, table tent,
sandwich board, or printed sign — and you extract EVERYTHING relevant into a
strict JSON shape that matches HappiTime's data model.

Return STRICT JSON in this exact shape, no markdown, no commentary:

{
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
- If no menu content visible, return menu.sections: [].`;

function buildUserPrompt(venueName?: string): string {
  return venueName
    ? `Venue: ${venueName}. Extract the happy-hour windows AND menu visible in this image.`
    : 'Extract the happy-hour windows AND menu visible in this image.';
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
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

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
  if (!apiKey) throw new Error('GOOGLE_AI_API_KEY not configured');

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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await isAdminEmail(user.email))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
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

  try {
    const { parsed, usage } = await runVisionExtract(base64, image.type, venueName);
    const errors = validate(parsed);
    return NextResponse.json({
      ok: errors.length === 0,
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
    return NextResponse.json(
      { error: 'extract_failed', provider: PROVIDER, model: MODEL, message: err?.message ?? String(err) },
      { status: 502 },
    );
  }
}
