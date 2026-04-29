'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import {
  deleteVenueMedia,
  insertVenueMedia,
  listVenueMedia,
  setCoverPhoto,
  type MediaRow,
  type MediaType,
} from '@/services/media-store';

export default function VenueMediaUploader(props: { orgId: string; venueId: string }) {
  const { orgId, venueId } = props;
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  function publicUrl(storagePath: string) {
    const { data } = supabase.storage.from('venue-media').getPublicUrl(storagePath);
    return data?.publicUrl ?? '';
  }

  const [rows, setRows] = useState<MediaRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [coverBusyId, setCoverBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const result = await listVenueMedia(supabase, orgId, venueId);
    if (result.error) {
      setError(result.error);
    } else {
      setError(null);
      setRows(result.data);
    }
  }, [supabase, orgId, venueId]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function uploadFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const ext = file.name.split('.').pop() ?? 'bin';
      const path = `${orgId}/${venueId}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('venue-media')
        .upload(path, file, { upsert: false });

      if (uploadError) throw uploadError;

      const type: MediaType =
        file.type.startsWith('video/')
          ? 'video'
          : file.type === 'application/pdf'
            ? 'menu_pdf'
            : 'image';

      // First upload becomes cover (sort_order 0); subsequent get appended
      const nextOrder = rows.length === 0 ? 0 : Math.max(...rows.map((r) => r.sort_order)) + 1;

      const result = await insertVenueMedia(supabase, {
        org_id: orgId,
        venue_id: venueId,
        type,
        title: file.name,
        storage_path: path,
        sort_order: nextOrder,
      });

      if (result.error) throw new Error(result.error);
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(row: MediaRow) {
    if (!confirm(`Delete "${row.title ?? row.type}"?`)) return;
    setDeletingId(row.id);
    setError(null);
    const result = await deleteVenueMedia(supabase, row.id, row.storage_path);
    setDeletingId(null);
    if (result.error) {
      setError(result.error);
    } else {
      await refresh();
    }
  }

  async function handleSetCover(row: MediaRow) {
    setCoverBusyId(row.id);
    setError(null);
    const result = await setCoverPhoto(supabase, row.id, rows);
    setCoverBusyId(null);
    if (result.error) {
      setError(result.error);
    } else {
      await refresh();
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) void uploadFile(file);
  }

  // Mirror the consumer site's display logic: source priority first, then sort_order.
  // (apps/directory/src/lib/queries.ts uses identical SOURCE_PRIORITY ordering.)
  const SOURCE_PRIORITY: Record<string, number> = {
    upload: 0,
    website: 1,
    google_places: 2,
    unsplash: 3,
    unknown: 4,
  };
  function priorityOf(r: MediaRow) {
    return SOURCE_PRIORITY[r.source ?? 'unknown'] ?? 4;
  }
  const imagesDisplayOrder = [...rows]
    .filter((r) => r.type === 'image')
    .sort((a, b) => {
      const pa = priorityOf(a);
      const pb = priorityOf(b);
      if (pa !== pb) return pa - pb;
      return a.sort_order - b.sort_order;
    });
  // First image in display order = the cover that actually shows on the consumer site.
  const displayedCoverId = imagesDisplayOrder[0]?.id ?? null;
  const positionById = new Map(imagesDisplayOrder.map((r, i) => [r.id, i]));
  const others = rows.filter((r) => r.type !== 'image');

  function sourceBadge(source: string | null | undefined) {
    const s = source ?? 'unknown';
    if (s === 'upload') return { label: 'Uploaded', bg: '#DCFCE7', fg: '#065F46' };
    if (s === 'google_places') return { label: 'Google', bg: '#E0E7FF', fg: '#3730A3' };
    if (s === 'website') return { label: 'Website', bg: '#FEF3C7', fg: '#92400E' };
    if (s === 'unsplash') return { label: 'Unsplash', bg: '#F3F4F6', fg: '#374151' };
    return null;
  }

  return (
    <div className="col" style={{ gap: 16 }}>
      {/* Where-images-show explainer */}
      <div style={{
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '12px 14px',
        background: 'var(--surface)',
        display: 'grid',
        gridTemplateColumns: 'auto 1fr',
        gap: 12,
        alignItems: 'start',
      }}>
        <div style={{
          fontSize: 18,
          lineHeight: '20px',
          padding: 4,
        }}>📍</div>
        <div style={{ display: 'grid', gap: 6 }}>
          <strong style={{ fontSize: 13 }}>Where these images appear</strong>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'grid', gap: 2 }}>
            <span>
              <span style={{
                display: 'inline-block', minWidth: 56, padding: '1px 7px', marginRight: 6,
                background: 'var(--brand)', color: '#fff', fontSize: 10, fontWeight: 700,
                borderRadius: 999, letterSpacing: '0.06em', textTransform: 'uppercase',
                textAlign: 'center',
              }}>Cover</span>
              Hero image at the top of the venue page on the website AND mobile app, plus the venue card thumbnail in lists.
            </span>
            <span>
              <span style={{
                display: 'inline-block', minWidth: 56, padding: '1px 7px', marginRight: 6,
                background: '#E5E7EB', color: '#374151', fontSize: 10, fontWeight: 700,
                borderRadius: 999, letterSpacing: '0.06em', textTransform: 'uppercase',
                textAlign: 'center',
              }}>Gallery</span>
              Shown in the venue's photo gallery in the order numbered below.
            </span>
            <span style={{ marginTop: 4 }}>
              Uploaded photos always rank ahead of Google Places photos. If the cover isn't what you expect, upload your preferred photo or click <em>Set Cover</em>.
            </span>
          </div>
        </div>
      </div>

      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        style={{
          border: `2px dashed ${dragOver ? 'var(--brand)' : 'var(--border)'}`,
          borderRadius: 12,
          padding: '28px 16px',
          textAlign: 'center',
          cursor: busy ? 'not-allowed' : 'pointer',
          background: dragOver ? 'rgba(224,82,40,0.04)' : 'var(--surface)',
          transition: 'border-color 0.15s, background 0.15s',
          userSelect: 'none',
        }}
      >
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 14 }}>
          {busy ? 'Uploading…' : 'Drop a photo/video here, or click to choose'}
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*,application/pdf"
          style={{ display: 'none' }}
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void uploadFile(f);
            e.currentTarget.value = '';
          }}
        />
      </div>

      {error ? (
        <div className="card error" style={{ padding: '10px 14px' }}>
          <span style={{ fontSize: 13 }}>{error}</span>
        </div>
      ) : null}

      {/* Image grid — ordered the same way the consumer site shows them */}
      {imagesDisplayOrder.length > 0 ? (
        <div>
          <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>
            Photos · {imagesDisplayOrder.length}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
            {imagesDisplayOrder.map((row) => {
              const isCover = row.id === displayedCoverId;
              const position = (positionById.get(row.id) ?? 0) + 1; // 1-indexed for humans
              const isDeleting = deletingId === row.id;
              const isCoverBusy = coverBusyId === row.id;
              const srcBadge = sourceBadge(row.source);

              return (
                <div
                  key={row.id}
                  style={{
                    position: 'relative',
                    borderRadius: 10,
                    overflow: 'hidden',
                    border: isCover ? '2px solid var(--brand)' : '1px solid var(--border)',
                    aspectRatio: '4/3',
                    background: '#f3f4f6',
                  }}
                >
                  <img
                    src={publicUrl(row.storage_path)}
                    alt={row.title ?? 'venue photo'}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                  {/* Position pill — Cover or Gallery #N */}
                  <span style={{
                    position: 'absolute',
                    top: 6,
                    left: 6,
                    background: isCover ? 'var(--brand)' : 'rgba(17,24,39,0.78)',
                    color: '#fff',
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '2px 7px',
                    borderRadius: 999,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                  }}>
                    {isCover ? 'Cover' : `Gallery #${position - 1}`}
                  </span>
                  {/* Source pill — top-right */}
                  {srcBadge ? (
                    <span style={{
                      position: 'absolute',
                      top: 6,
                      right: 6,
                      background: srcBadge.bg,
                      color: srcBadge.fg,
                      fontSize: 9,
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: 999,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                    }}>
                      {srcBadge.label}
                    </span>
                  ) : null}

                  {/* Hover overlay */}
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'rgba(0,0,0,0.52)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    opacity: 0,
                    transition: 'opacity 0.15s',
                  }}
                    className="media-overlay"
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = '0')}
                  >
                    {!isCover ? (
                      <button
                        className="secondary"
                        disabled={isCoverBusy || isDeleting}
                        onClick={() => void handleSetCover(row)}
                        style={{ fontSize: 11, padding: '5px 10px', width: 'auto' }}
                      >
                        {isCoverBusy ? '…' : 'Set Cover'}
                      </button>
                    ) : null}
                    <button
                      disabled={isDeleting || isCoverBusy}
                      onClick={() => void handleDelete(row)}
                      style={{
                        fontSize: 11,
                        padding: '5px 10px',
                        width: 'auto',
                        background: '#dc2626',
                        border: 'none',
                      }}
                    >
                      {isDeleting ? '…' : 'Delete'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Non-image files list */}
      {others.length > 0 ? (
        <div>
          <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>
            Other files
          </p>
          <div className="col" style={{ gap: 8 }}>
            {others.map((row) => {
              const isDeleting = deletingId === row.id;
              return (
                <div key={row.id} className="card" style={{ padding: '10px 14px' }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <div className="col" style={{ gap: 2 }}>
                      <strong style={{ fontSize: 13 }}>{row.title ?? row.type}</strong>
                      <span className="muted" style={{ fontSize: 12 }}>{row.type}</span>
                    </div>
                    <div className="row" style={{ gap: 8 }}>
                      <a href={publicUrl(row.storage_path)} target="_blank" rel="noreferrer">
                        <button className="secondary" style={{ padding: '6px 10px', fontSize: 12 }}>Open</button>
                      </a>
                      <button
                        disabled={isDeleting}
                        onClick={() => void handleDelete(row)}
                        style={{ padding: '6px 10px', fontSize: 12, background: '#dc2626', border: 'none' }}
                      >
                        {isDeleting ? '…' : 'Delete'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {rows.length === 0 && !busy ? (
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>No media yet.</p>
      ) : null}
    </div>
  );
}
