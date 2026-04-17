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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

function publicUrl(storagePath: string) {
  return `${SUPABASE_URL}/storage/v1/object/public/venue-media/${storagePath}`;
}

export default function VenueMediaUploader(props: { orgId: string; venueId: string }) {
  const { orgId, venueId } = props;
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

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

  const coverRow = rows.find((r) => r.sort_order === 0);
  const images = rows.filter((r) => r.type === 'image');
  const others = rows.filter((r) => r.type !== 'image');

  return (
    <div className="col" style={{ gap: 16 }}>
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

      {/* Image grid */}
      {images.length > 0 ? (
        <div>
          <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>
            Photos
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
            {images.map((row) => {
              const isCover = row.sort_order === 0;
              const isDeleting = deletingId === row.id;
              const isCoverBusy = coverBusyId === row.id;

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
                  {isCover ? (
                    <span style={{
                      position: 'absolute',
                      top: 6,
                      left: 6,
                      background: 'var(--brand)',
                      color: '#fff',
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 7px',
                      borderRadius: 999,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                    }}>
                      Cover
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
