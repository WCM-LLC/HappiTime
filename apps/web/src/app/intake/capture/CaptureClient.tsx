'use client';

/**
 * Mobile field-capture UI for AI menu + windows intake.
 *
 * Gemini extracts BOTH menu and windows from the photo (whatever's visible).
 * The UI surfaces what came back, lets you reconcile extracted windows against
 * existing ones on the venue (use existing / create new / skip), and lets you
 * either Save-as-Draft (saves whatever's there) or Publish (requires complete).
 *
 * Writes to: menus + menu_sections + menu_items + happy_hour_window_menus,
 * and (when create_new is chosen) happy_hour_windows. Same shape your console
 * already writes. No schema changes.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient as createSupabaseBrowser } from '@supabase/supabase-js';

type Venue = { id: string; name: string; address: string | null; city: string | null };

type ExistingWindow = {
  id: string;
  dow: number[];
  start_time: string;
  end_time: string;
  label: string | null;
};

type ExtractedWindow = {
  dow: number[];
  start_time: string;
  end_time: string;
  label?: string | null;
};

type WindowDisposition =
  | { kind: 'unset' }
  | { kind: 'use_existing'; id: string }
  | { kind: 'create_new' }
  | { kind: 'skip' };

type MenuItem = { name: string; price: number | null; description?: string };
type MenuSection = { name: string; items: MenuItem[] };

const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getBrowserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  return createSupabaseBrowser(url, anon);
}

/** Downscale a 4 MB iPhone JPEG to ~400 KB before upload. Falls back to original on failure. */
async function resizeImageIfNeeded(file: File, maxWidth = 1600, quality = 0.85): Promise<File> {
  if (file.size < 800_000) return file;
  try {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('image_decode_failed'));
      i.src = dataUrl;
    });
    if (img.width <= maxWidth) return file;
    const scale = maxWidth / img.width;
    const canvas = document.createElement('canvas');
    canvas.width = maxWidth;
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    );
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

function fmtWindow(w: { dow: number[]; start_time: string; end_time: string; label?: string | null }) {
  const days = [...w.dow].sort((a, b) => a - b).map((d) => DOW_NAMES[d]).join('/');
  const range = `${w.start_time.slice(0, 5)}–${w.end_time.slice(0, 5)}`;
  return `${days} · ${range}${w.label ? ` (${w.label})` : ''}`;
}

/** Find an existing window that matches an extracted one on (dow set, start, end). */
function findMatchingExisting(ex: ExtractedWindow, existings: ExistingWindow[]): ExistingWindow | null {
  const exDow = [...ex.dow].sort((a, b) => a - b).join(',');
  const exStart = ex.start_time.slice(0, 5);
  const exEnd = ex.end_time.slice(0, 5);
  for (const e of existings) {
    const eDow = [...e.dow].sort((a, b) => a - b).join(',');
    if (eDow === exDow && e.start_time.slice(0, 5) === exStart && e.end_time.slice(0, 5) === exEnd) {
      return e;
    }
  }
  return null;
}

export default function CaptureClient({ confirmationConfigured }: { confirmationConfigured: boolean }) {
  // ── venue picker ────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Venue[]>([]);
  const [venue, setVenue] = useState<Venue | null>(null);
  const supabase = useMemo(() => getBrowserSupabase(), []);

  useEffect(() => {
    if (venue) return;
    const q = search.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('venues')
        .select('id, name, address, city')
        .ilike('name', `%${q}%`)
        .order('name', { ascending: true })
        .limit(8);
      setResults((data ?? []) as Venue[]);
    }, 200);
    return () => clearTimeout(t);
  }, [search, venue, supabase]);

  // ── existing windows on selected venue ──────────────────────────────────
  const [existingWindows, setExistingWindows] = useState<ExistingWindow[]>([]);
  const [selectedExistingIds, setSelectedExistingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!venue) {
      setExistingWindows([]);
      setSelectedExistingIds(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('happy_hour_windows')
        .select('id, dow, start_time, end_time, label')
        .eq('venue_id', venue.id)
        .eq('status', 'published')
        .order('start_time', { ascending: true });
      if (!cancelled) setExistingWindows((data ?? []) as ExistingWindow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [venue, supabase]);

  function toggleExisting(id: string) {
    setSelectedExistingIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ── photo + extract ─────────────────────────────────────────────────────
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  const [menuName, setMenuName] = useState('Happy Hour');
  const [sections, setSections] = useState<MenuSection[]>([]);
  const [extractedWindows, setExtractedWindows] = useState<ExtractedWindow[]>([]);
  const [extractedDispositions, setExtractedDispositions] = useState<WindowDisposition[]>([]);
  const [extractMeta, setExtractMeta] = useState<{
    confidence?: string;
    notes?: string;
    hasMenu: boolean;
    hasWindows: boolean;
  } | null>(null);

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function runExtract() {
    if (!file || !venue) return;
    setExtracting(true);
    setExtractError(null);
    try {
      const uploadFile = await resizeImageIfNeeded(file);
      const fd = new FormData();
      fd.append('image', uploadFile);
      fd.append('venue_name', venue.name);
      const res = await fetch('/api/intake/extract', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) {
        setExtractError(json?.error ?? 'extract_failed');
        return;
      }

      // Menu
      const m = json?.draft?.menu ?? {};
      const newSections = Array.isArray(m.sections)
        ? m.sections.map((s: any) => ({
            name: String(s?.name ?? ''),
            items: Array.isArray(s?.items)
              ? s.items.map((it: any) => ({
                  name: String(it?.name ?? ''),
                  price:
                    typeof it?.price === 'number' && Number.isFinite(it.price) ? it.price : null,
                  description: it?.description ?? undefined,
                }))
              : [],
          }))
        : [];
      setMenuName(m.name || 'Happy Hour');
      setSections(newSections);

      // Windows
      const ws: ExtractedWindow[] = Array.isArray(json?.draft?.windows)
        ? json.draft.windows.map((w: any) => ({
            dow: Array.isArray(w?.dow) ? w.dow : [],
            start_time: String(w?.start_time ?? ''),
            end_time: String(w?.end_time ?? ''),
            label: w?.label ?? null,
          }))
        : [];
      setExtractedWindows(ws);

      // Default disposition for each extracted window:
      //   - If it matches an existing window exactly → use_existing
      //   - Otherwise → unset (user picks: create_new vs skip)
      setExtractedDispositions(
        ws.map((w) => {
          const match = findMatchingExisting(w, existingWindows);
          return match ? { kind: 'use_existing', id: match.id } : { kind: 'unset' };
        }),
      );

      // Also auto-check matching existing windows so the user sees they're attached.
      const autoAttachIds = new Set(selectedExistingIds);
      for (const w of ws) {
        const match = findMatchingExisting(w, existingWindows);
        if (match) autoAttachIds.add(match.id);
      }
      setSelectedExistingIds(autoAttachIds);

      setExtractMeta({
        confidence: json?.draft?._confidence,
        notes: json?.draft?._notes,
        hasMenu: newSections.length > 0,
        hasWindows: ws.length > 0,
      });
    } catch (err: any) {
      setExtractError(err?.message ?? 'extract_failed');
    } finally {
      setExtracting(false);
    }
  }

  function setDisposition(idx: number, d: WindowDisposition) {
    setExtractedDispositions((prev) => prev.map((x, i) => (i === idx ? d : x)));
    if (d.kind === 'use_existing') {
      setSelectedExistingIds((prev) => new Set(prev).add(d.id));
    }
  }

  // ── menu editing helpers ────────────────────────────────────────────────
  function updateSection(si: number, patch: Partial<MenuSection>) {
    setSections((prev) => prev.map((s, i) => (i === si ? { ...s, ...patch } : s)));
  }
  function removeSection(si: number) {
    setSections((prev) => prev.filter((_, i) => i !== si));
  }
  function addSection() {
    setSections((prev) => [...prev, { name: 'New Section', items: [] }]);
  }
  function updateItem(si: number, ii: number, patch: Partial<MenuItem>) {
    setSections((prev) =>
      prev.map((s, i) =>
        i !== si
          ? s
          : { ...s, items: s.items.map((it, j) => (j === ii ? { ...it, ...patch } : it)) },
      ),
    );
  }
  function removeItem(si: number, ii: number) {
    setSections((prev) =>
      prev.map((s, i) => (i !== si ? s : { ...s, items: s.items.filter((_, j) => j !== ii) })),
    );
  }
  function addItem(si: number) {
    setSections((prev) =>
      prev.map((s, i) => (i !== si ? s : { ...s, items: [...s.items, { name: '', price: null }] })),
    );
  }

  // ── commit ──────────────────────────────────────────────────────────────
  const [sendConfirmation, setSendConfirmation] = useState(false);
  const [ownerEmail, setOwnerEmail] = useState('');
  const [committing, setCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState<any>(null);
  const [commitError, setCommitError] = useState<string | null>(null);

  const totalItems = sections.reduce((sum, s) => sum + s.items.length, 0);
  const newWindowsToCreate = extractedWindows
    .map((w, i) => ({ w, d: extractedDispositions[i] }))
    .filter((x) => x.d?.kind === 'create_new')
    .map((x) => x.w);
  const totalAttachedWindows = selectedExistingIds.size + newWindowsToCreate.length;
  const canPublishStrict =
    venue != null && totalAttachedWindows > 0 && sections.length > 0 && totalItems > 0;

  async function commit(mode: 'publish' | 'draft') {
    if (!venue) return;
    setCommitting(true);
    setCommitError(null);
    try {
      const body: any = {
        venue_id: venue.id,
        window_ids: Array.from(selectedExistingIds),
        new_windows: newWindowsToCreate.map((w) => ({
          dow: w.dow,
          start_time: w.start_time.slice(0, 5),
          end_time: w.end_time.slice(0, 5),
          label: w.label ?? null,
        })),
        menu: { name: menuName, sections },
        save_as_draft: mode === 'draft',
        send_owner_confirmation: mode === 'publish' && sendConfirmation,
      };
      if (mode === 'publish' && sendConfirmation) body.owner_email = ownerEmail.trim();

      const res = await fetch('/api/intake/commit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setCommitError(
          json?.errors ? json.errors.join('; ') : json?.error ?? 'commit_failed',
        );
        return;
      }
      setCommitResult(json);
    } catch (err: any) {
      setCommitError(err?.message ?? 'commit_failed');
    } finally {
      setCommitting(false);
    }
  }

  function reset() {
    setVenue(null);
    setSearch('');
    setResults([]);
    setExistingWindows([]);
    setSelectedExistingIds(new Set());
    setFile(null);
    setPreview(null);
    setMenuName('Happy Hour');
    setSections([]);
    setExtractedWindows([]);
    setExtractedDispositions([]);
    setExtractMeta(null);
    setSendConfirmation(false);
    setOwnerEmail('');
    setCommitResult(null);
    setCommitError(null);
    setExtractError(null);
    if (fileInput.current) fileInput.current.value = '';
  }

  // ── result screen ───────────────────────────────────────────────────────
  if (commitResult) {
    const tone = commitResult.published ? '#16a34a' : commitResult.drafted ? '#6b7280' : '#f59e0b';
    const heading = commitResult.published
      ? '✓ Published live'
      : commitResult.drafted
      ? '✓ Saved as draft'
      : '✓ Drafted — owner notified';
    return (
      <main style={shellStyle}>
        <h1 style={h1}>Done.</h1>
        <div style={{ ...card, borderColor: tone }}>
          <strong>{heading}</strong>
          <p style={{ marginTop: 8, color: '#374151' }}>
            Menu ({sections.length} section{sections.length === 1 ? '' : 's'}, {totalItems} item
            {totalItems === 1 ? '' : 's'}) attached to {commitResult.window_ids?.length ?? 0} window
            {commitResult.window_ids?.length === 1 ? '' : 's'} on {venue?.name}.
            {commitResult.new_window_ids?.length ? (
              <> Created {commitResult.new_window_ids.length} new window
                {commitResult.new_window_ids.length === 1 ? '' : 's'} on the venue.</>
            ) : null}
          </p>
          {commitResult.claim_url ? (
            <p style={{ fontSize: 12, color: '#6b7280', wordBreak: 'break-all', marginTop: 8 }}>
              Claim link: <a href={commitResult.claim_url}>{commitResult.claim_url}</a>
              {commitResult.email?.sent === false ? (
                <em> — email could not be sent ({commitResult.email?.reason}); copy this link to the owner manually.</em>
              ) : null}
            </p>
          ) : null}
        </div>
        <button onClick={reset} style={primaryBtn}>
          Capture another
        </button>
      </main>
    );
  }

  // ── main UI ─────────────────────────────────────────────────────────────
  return (
    <main style={shellStyle}>
      <h1 style={h1}>Field Capture</h1>

      {/* STEP 1: venue */}
      <section style={section}>
        <label style={labelStyle}>1. Venue</label>
        {venue ? (
          <div style={card}>
            <strong>{venue.name}</strong>
            <div style={{ fontSize: 13, color: '#6b7280' }}>
              {venue.address ?? ''}
              {venue.city ? `, ${venue.city}` : ''}
            </div>
            <button onClick={() => setVenue(null)} style={linkBtn}>
              change
            </button>
          </div>
        ) : (
          <>
            <input
              type="search"
              placeholder="Search venues by name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={input}
              autoComplete="off"
            />
            {results.length > 0 && (
              <ul style={resultList}>
                {results.map((v) => (
                  <li key={v.id} style={resultItem} onClick={() => setVenue(v)}>
                    <strong>{v.name}</strong>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>
                      {v.address ?? ''}
                      {v.city ? `, ${v.city}` : ''}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      {/* STEP 2: photo */}
      {venue ? (
        <section style={section}>
          <label style={labelStyle}>2. Photo</label>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            style={{ display: 'block', marginBottom: 12 }}
          />
          {preview && (
            <div style={{ marginTop: 8 }}>
              <img src={preview} alt="capture preview" style={{ maxWidth: '100%', borderRadius: 8 }} />
            </div>
          )}
          {file ? (
            <button onClick={runExtract} disabled={extracting} style={primaryBtn}>
              {extracting ? 'Extracting…' : 'Extract from photo'}
            </button>
          ) : null}
          {extractError ? <p style={errStyle}>Extract failed: {extractError}</p> : null}
        </section>
      ) : null}

      {/* STEP 3: extract status banner */}
      {extractMeta ? (
        <section style={section}>
          <label style={labelStyle}>3. What we found</label>
          <div
            style={{
              ...card,
              borderColor:
                extractMeta.confidence === 'high'
                  ? '#16a34a'
                  : extractMeta.confidence === 'medium'
                  ? '#f59e0b'
                  : '#9ca3af',
            }}
          >
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13 }}>
              <div>
                <strong style={{ color: extractMeta.hasWindows ? '#15803d' : '#b91c1c' }}>
                  {extractMeta.hasWindows ? '✓' : '✗'} Times
                </strong>
                <div style={{ color: '#6b7280', fontSize: 12 }}>
                  {extractedWindows.length} window{extractedWindows.length === 1 ? '' : 's'} extracted
                </div>
              </div>
              <div>
                <strong style={{ color: extractMeta.hasMenu ? '#15803d' : '#b91c1c' }}>
                  {extractMeta.hasMenu ? '✓' : '✗'} Menu
                </strong>
                <div style={{ color: '#6b7280', fontSize: 12 }}>
                  {sections.length} section{sections.length === 1 ? '' : 's'} · {totalItems} item
                  {totalItems === 1 ? '' : 's'}
                </div>
              </div>
              {extractMeta.confidence ? (
                <div>
                  <strong>Confidence</strong>
                  <div style={{ color: '#6b7280', fontSize: 12 }}>{extractMeta.confidence}</div>
                </div>
              ) : null}
            </div>
            {extractMeta.notes ? (
              <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>
                <em>{extractMeta.notes}</em>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* STEP 4: windows — existing checkboxes + extracted reconciliation */}
      {venue ? (
        <section style={section}>
          <label style={labelStyle}>4. Windows the menu attaches to</label>

          {/* Existing venue windows */}
          {existingWindows.length > 0 ? (
            <>
              <div style={subLabel}>Existing windows on this venue:</div>
              {existingWindows.map((ew) => {
                const checked = selectedExistingIds.has(ew.id);
                return (
                  <label
                    key={ew.id}
                    style={{
                      ...card,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      borderColor: checked ? '#2563eb' : '#e5e7eb',
                      background: checked ? '#eff6ff' : '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleExisting(ew.id)}
                      style={{ width: 20, height: 20 }}
                    />
                    <div style={{ fontSize: 14 }}>{fmtWindow(ew)}</div>
                  </label>
                );
              })}
            </>
          ) : (
            <div style={{ ...card, background: '#f9fafb' }}>
              <div style={{ fontSize: 13, color: '#6b7280' }}>
                No published windows on this venue yet. Use the extracted windows below, or add new ones manually in the console first.
              </div>
            </div>
          )}

          {/* Extracted windows from photo */}
          {extractedWindows.length > 0 ? (
            <>
              <div style={{ ...subLabel, marginTop: 16 }}>From the photo:</div>
              {extractedWindows.map((ew, i) => {
                const d = extractedDispositions[i] ?? { kind: 'unset' };
                const match = findMatchingExisting(ew, existingWindows);
                return (
                  <div key={i} style={card}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{fmtWindow(ew)}</div>
                    {match && d.kind !== 'create_new' && d.kind !== 'skip' ? (
                      <div style={{ fontSize: 12, color: '#15803d', marginTop: 4 }}>
                        ✓ matches existing window — using it
                      </div>
                    ) : null}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                      {match ? (
                        <button
                          onClick={() => setDisposition(i, { kind: 'use_existing', id: match.id })}
                          style={d.kind === 'use_existing' ? primaryPill : pill}
                        >
                          Use existing
                        </button>
                      ) : null}
                      <button
                        onClick={() => setDisposition(i, { kind: 'create_new' })}
                        style={d.kind === 'create_new' ? primaryPill : pill}
                      >
                        Create new
                      </button>
                      <button
                        onClick={() => setDisposition(i, { kind: 'skip' })}
                        style={d.kind === 'skip' ? primaryPill : pill}
                      >
                        Skip
                      </button>
                    </div>
                  </div>
                );
              })}
            </>
          ) : null}
        </section>
      ) : null}

      {/* STEP 5: menu editor */}
      {venue ? (
        <section style={section}>
          <label style={labelStyle}>5. Menu</label>
          <input
            type="text"
            placeholder="Menu name (e.g. Happy Hour)"
            value={menuName}
            onChange={(e) => setMenuName(e.target.value)}
            style={input}
          />

          {sections.map((s, si) => (
            <div key={si} style={card}>
              <input
                type="text"
                value={s.name}
                placeholder="Section name (e.g. Eats, Drinks)"
                onChange={(e) => updateSection(si, { name: e.target.value })}
                style={{ ...input, fontWeight: 600 }}
              />
              {s.items.map((it, ii) => (
                <div key={ii} style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'flex-start' }}>
                  <input
                    type="text"
                    value={it.name}
                    placeholder="Item name"
                    onChange={(e) => updateItem(si, ii, { name: e.target.value })}
                    style={{ ...input, flex: 2, marginTop: 0 }}
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={it.price ?? ''}
                    placeholder="$"
                    onChange={(e) =>
                      updateItem(si, ii, {
                        price: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                    style={{ ...input, flex: 1, marginTop: 0 }}
                  />
                  <button
                    onClick={() => removeItem(si, ii)}
                    style={{ ...linkBtn, marginTop: 8 }}
                    aria-label="remove item"
                  >
                    ×
                  </button>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                <button onClick={() => addItem(si)} style={secondaryBtn}>
                  + add item
                </button>
                <button onClick={() => removeSection(si)} style={linkBtn}>
                  remove section
                </button>
              </div>
            </div>
          ))}
          <button onClick={addSection} style={secondaryBtn}>
            + add section
          </button>
        </section>
      ) : null}

      {/* STEP 6: publish */}
      {venue ? (
        <section style={section}>
          <label style={labelStyle}>6. Save or publish</label>
          <div style={card}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                cursor: confirmationConfigured ? 'pointer' : 'not-allowed',
                opacity: confirmationConfigured ? 1 : 0.5,
              }}
            >
              <input
                type="checkbox"
                checked={sendConfirmation}
                disabled={!confirmationConfigured}
                onChange={(e) => setSendConfirmation(e.target.checked)}
              />
              <span>
                <strong>Send owner a confirmation link</strong>
                <div style={{ fontSize: 12, color: '#6b7280' }}>
                  Drafts and emails the owner a one-tap publish link. Marketing touch.
                </div>
              </span>
            </label>
            {!confirmationConfigured ? (
              <p style={{ fontSize: 12, color: '#b91c1c', marginTop: 8 }}>
                Set <code>INTAKE_CONFIRM_SECRET</code> in env to enable this.
              </p>
            ) : null}
            {sendConfirmation ? (
              <input
                type="email"
                placeholder="owner@venue.com"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                style={{ ...input, marginTop: 12 }}
                autoComplete="off"
              />
            ) : null}
          </div>

          {!canPublishStrict ? (
            <p style={{ fontSize: 12, color: '#92400e', marginTop: 8 }}>
              {totalAttachedWindows === 0
                ? 'No windows attached — Publish disabled. Save as draft to keep what you have.'
                : sections.length === 0 || totalItems === 0
                ? 'No menu items — Publish disabled. Save as draft to keep what you have.'
                : null}
            </p>
          ) : null}

          <button
            onClick={() => commit('publish')}
            disabled={committing || !canPublishStrict}
            style={primaryBtn}
          >
            {committing
              ? 'Saving…'
              : sendConfirmation
              ? 'Draft + send owner link'
              : 'Auto-publish'}
          </button>
          <button onClick={() => commit('draft')} disabled={committing} style={draftBtn}>
            {committing ? 'Saving…' : 'Save as draft'}
          </button>
          {commitError ? <p style={errStyle}>{commitError}</p> : null}
        </section>
      ) : null}
    </main>
  );
}

// ── styles ────────────────────────────────────────────────────────────────

const shellStyle: React.CSSProperties = {
  maxWidth: 540,
  margin: '0 auto',
  padding: '24px 16px 96px',
  fontFamily: 'system-ui,-apple-system,Segoe UI,Helvetica,Arial,sans-serif',
};
const h1: React.CSSProperties = { fontSize: 24, margin: '0 0 16px' };
const section: React.CSSProperties = { marginBottom: 28 };
const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: '#374151',
  marginBottom: 8,
};
const subLabel: React.CSSProperties = {
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  color: '#6b7280',
  marginBottom: 8,
};
const input: React.CSSProperties = {
  width: '100%',
  border: '1px solid #d1d5db',
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 16,
  marginTop: 8,
  boxSizing: 'border-box',
};
const card: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  padding: 12,
  marginBottom: 12,
  background: '#fff',
};
const resultList: React.CSSProperties = {
  listStyle: 'none',
  padding: 0,
  margin: '8px 0 0',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
};
const resultItem: React.CSSProperties = {
  padding: '10px 12px',
  borderBottom: '1px solid #f3f4f6',
  cursor: 'pointer',
};
const primaryBtn: React.CSSProperties = {
  background: '#111',
  color: '#fff',
  border: 0,
  padding: '14px 22px',
  borderRadius: 8,
  fontSize: 16,
  fontWeight: 600,
  width: '100%',
  marginTop: 12,
  cursor: 'pointer',
};
const draftBtn: React.CSSProperties = {
  background: '#fff',
  color: '#111',
  border: '1px solid #d1d5db',
  padding: '12px 22px',
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 600,
  width: '100%',
  marginTop: 8,
  cursor: 'pointer',
};
const secondaryBtn: React.CSSProperties = {
  background: '#fff',
  color: '#111',
  border: '1px solid #d1d5db',
  padding: '10px 14px',
  borderRadius: 8,
  fontSize: 14,
  marginTop: 8,
  cursor: 'pointer',
};
const linkBtn: React.CSSProperties = {
  background: 'transparent',
  border: 0,
  color: '#6b7280',
  textDecoration: 'underline',
  fontSize: 12,
  padding: 0,
  marginTop: 8,
  cursor: 'pointer',
};
const pill: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #d1d5db',
  borderRadius: 999,
  padding: '6px 12px',
  fontSize: 13,
  cursor: 'pointer',
};
const primaryPill: React.CSSProperties = {
  ...pill,
  background: '#111',
  color: '#fff',
  borderColor: '#111',
};
const errStyle: React.CSSProperties = { color: '#b91c1c', marginTop: 8, fontSize: 14 };
