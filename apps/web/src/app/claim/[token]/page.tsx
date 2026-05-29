/**
 * /claim/[token]
 *
 * Public route. Venue owner arrives here from the field-intake confirmation
 * email. We verify the signed token, fetch the draft MENU + its sections + items
 * + the windows it's attached to, render a preview, and offer a single
 * "Publish" button that flips the menu to published.
 *
 * Token: opaque HMAC-signed payload from utils/intake-token.ts (v2 = menu).
 * Action: POSTs to /api/intake/claim with the token.
 */
import { verifyIntakeConfirmToken } from '@/utils/intake-token';
import { createServiceClient, getServiceRoleKeyError } from '@/utils/supabase/server';
import ClaimForm from './ClaimForm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatWindow(w: { dow: number[]; start_time: string; end_time: string; label?: string | null }) {
  const days = [...w.dow].sort((a, b) => a - b).map((d) => DOW_NAMES[d]).join('/');
  return `${days} · ${w.start_time.slice(0, 5)}–${w.end_time.slice(0, 5)}${w.label ? ` (${w.label})` : ''}`;
}

function formatPrice(p: number | null): string {
  if (p == null) return '';
  return `$${Number(p).toFixed(Number.isInteger(p) ? 0 : 2)}`;
}

export default async function ClaimPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const verified = verifyIntakeConfirmToken(decodeURIComponent(token));

  if (!verified.ok) {
    return (
      <main style={pageStyle}>
        <h1 style={h1Style}>This link is no longer valid</h1>
        <p style={pStyle}>
          {verified.reason === 'expired'
            ? "The confirmation link expired. We'll send a fresh one shortly — or you can reach out to the team that listed you."
            : 'The link is malformed or has been tampered with. Please ask HappiTime to resend your confirmation.'}
        </p>
      </main>
    );
  }

  if (getServiceRoleKeyError()) {
    return (
      <main style={pageStyle}>
        <h1 style={h1Style}>Confirmation is temporarily unavailable</h1>
        <p style={pStyle}>Our server is misconfigured. Please contact the HappiTime team.</p>
      </main>
    );
  }

  const db = createServiceClient();
  const { payload } = verified;

  // Fetch venue, menu with nested sections+items, and the windows by id.
  const [{ data: venue }, { data: menu }, { data: windows }] = await Promise.all([
    db.from('venues').select('id, name, address, city').eq('id', payload.venue_id).maybeSingle() as any,
    db
      .from('menus')
      .select(
        'id, name, status, menu_sections (id, name, sort_order, menu_items (id, name, description, price, sort_order))',
      )
      .eq('id', payload.menu_id)
      .maybeSingle() as any,
    db
      .from('happy_hour_windows')
      .select('id, dow, start_time, end_time, label, status')
      .in('id', payload.window_ids) as any,
  ]);

  if (!venue || !menu) {
    return (
      <main style={pageStyle}>
        <h1 style={h1Style}>Menu not found</h1>
        <p style={pStyle}>The listing referenced by this link is missing. Please contact the HappiTime team.</p>
      </main>
    );
  }

  const sections = ((menu.menu_sections ?? []) as any[]).slice().sort((a, b) => a.sort_order - b.sort_order);

  if (menu.status === 'published') {
    return (
      <main style={pageStyle}>
        <h1 style={h1Style}>{venue.name}</h1>
        <p style={subStyle}>
          {venue.address ? `${venue.address}, ` : ''}
          {venue.city ?? ''}
        </p>
        <div style={{ ...cardStyle, borderColor: '#16a34a' }}>
          <strong style={{ color: '#15803d' }}>Already published ✓</strong>
          <p style={pStyle}>Your HappiTime menu is live. Thanks for confirming.</p>
        </div>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <h1 style={h1Style}>{venue.name}</h1>
      <p style={subStyle}>
        {venue.address ? `${venue.address}, ` : ''}
        {venue.city ?? ''}
      </p>

      <h2 style={h2Style}>When this menu runs</h2>
      {(windows ?? []).length === 0 ? (
        <p style={pStyle}>No windows attached.</p>
      ) : (
        <ul style={listStyle}>
          {(windows ?? []).map((w: any) => (
            <li key={w.id} style={liStyle}>
              {formatWindow(w)}
            </li>
          ))}
        </ul>
      )}

      <h2 style={h2Style}>{menu.name}</h2>
      {sections.length === 0 ? (
        <p style={pStyle}>No sections in this menu.</p>
      ) : (
        sections.map((s: any) => {
          const items = (s.menu_items ?? []).slice().sort((a: any, b: any) => a.sort_order - b.sort_order);
          return (
            <div key={s.id} style={sectionStyle}>
              <h3 style={h3Style}>{s.name}</h3>
              <ul style={listStyle}>
                {items.map((it: any) => (
                  <li key={it.id} style={liStyle}>
                    <strong>{it.name}</strong>
                    {it.price != null ? <span style={priceStyle}> · {formatPrice(it.price)}</span> : null}
                    {it.description ? (
                      <div style={{ color: '#6b7280', fontSize: 13 }}>{it.description}</div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          );
        })
      )}

      <ClaimForm token={decodeURIComponent(token)} />
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  maxWidth: 540,
  margin: '0 auto',
  padding: '32px 20px 64px',
  fontFamily: 'system-ui,-apple-system,Segoe UI,Helvetica,Arial,sans-serif',
};
const h1Style: React.CSSProperties = { fontSize: 28, margin: '0 0 4px' };
const subStyle: React.CSSProperties = { color: '#6b7280', margin: '0 0 24px' };
const h2Style: React.CSSProperties = { fontSize: 18, margin: '24px 0 8px' };
const h3Style: React.CSSProperties = { fontSize: 15, margin: '16px 0 6px', color: '#374151' };
const pStyle: React.CSSProperties = { color: '#374151', lineHeight: 1.5 };
const cardStyle: React.CSSProperties = { border: '1px solid #d1d5db', borderRadius: 8, padding: 16, marginTop: 16 };
const sectionStyle: React.CSSProperties = { padding: '8px 0' };
const listStyle: React.CSSProperties = { listStyle: 'none', padding: 0, margin: 0 };
const liStyle: React.CSSProperties = { padding: '8px 0', borderBottom: '1px solid #f3f4f6' };
const priceStyle: React.CSSProperties = { color: '#111', fontWeight: 600 };
