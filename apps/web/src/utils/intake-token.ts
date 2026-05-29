/**
 * Stateless HMAC-signed token for venue-owner confirmation links.
 *
 * Why stateless: avoids a new table + migration. The token itself carries
 * the venue + draft IDs and an expiry; we verify the signature on click.
 *
 * Format: <base64url(JSON payload)>.<hex(HMAC-SHA256 over the payload)>
 *
 * Required env: INTAKE_CONFIRM_SECRET (any random 32+ byte string).
 * If unset, isIntakeConfirmConfigured() returns false and the confirmation
 * toggle in the UI is disabled — auto-publish path still works.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export type IntakeConfirmPayload = {
  v: 2; // schema version (v2 = menu-based; v1 = legacy offers, never shipped to prod)
  venue_id: string;
  menu_id: string;
  window_ids: string[]; // windows the menu is attached to (for display in claim page)
  exp: number; // unix seconds
};

const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days

function getSecret(): string | null {
  const s = process.env.INTAKE_CONFIRM_SECRET;
  return s && s.length >= 16 ? s : null;
}

export function isIntakeConfirmConfigured(): boolean {
  return getSecret() !== null;
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 2 ? '==' : s.length % 4 === 3 ? '=' : '';
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

export function signIntakeConfirmToken(input: Omit<IntakeConfirmPayload, 'v' | 'exp'> & { ttlSeconds?: number }): string {
  const secret = getSecret();
  if (!secret) throw new Error('INTAKE_CONFIRM_SECRET not configured');

  const payload: IntakeConfirmPayload = {
    v: 2,
    venue_id: input.venue_id,
    menu_id: input.menu_id,
    window_ids: [...input.window_ids],
    exp: Math.floor(Date.now() / 1000) + (input.ttlSeconds ?? DEFAULT_TTL_SECONDS),
  };
  const payloadJson = JSON.stringify(payload);
  const body = b64url(Buffer.from(payloadJson, 'utf8'));
  const sig = createHmac('sha256', secret).update(body).digest('hex');
  return `${body}.${sig}`;
}

export type VerifyResult =
  | { ok: true; payload: IntakeConfirmPayload }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' | 'not_configured' };

export function verifyIntakeConfirmToken(token: string): VerifyResult {
  const secret = getSecret();
  if (!secret) return { ok: false, reason: 'not_configured' };

  const dot = token.indexOf('.');
  if (dot < 0) return { ok: false, reason: 'malformed' };
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expected = createHmac('sha256', secret).update(body).digest('hex');
  if (expected.length !== sig.length) return { ok: false, reason: 'bad_signature' };
  let sigsMatch = false;
  try {
    sigsMatch = timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(sig, 'hex'));
  } catch {
    return { ok: false, reason: 'bad_signature' };
  }
  if (!sigsMatch) return { ok: false, reason: 'bad_signature' };

  let payload: IntakeConfirmPayload;
  try {
    payload = JSON.parse(b64urlDecode(body).toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (
    payload?.v !== 2 ||
    typeof payload.venue_id !== 'string' ||
    typeof payload.menu_id !== 'string' ||
    !Array.isArray(payload.window_ids) ||
    typeof payload.exp !== 'number'
  ) {
    return { ok: false, reason: 'malformed' };
  }
  if (Math.floor(Date.now() / 1000) > payload.exp) {
    return { ok: false, reason: 'expired' };
  }
  return { ok: true, payload };
}
