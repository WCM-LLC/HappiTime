import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import UserBar from '@/components/layout/UserBar';
import { createServiceClient } from '@/utils/supabase/server';
import StagingDetailClient from '../_components/StagingDetailClient';

type StagingDetailRow = {
  id: string;
  external_ref: string | null;
  payload: Record<string, unknown>;
  status: string;
  source: string;
  source_run_id: string | null;
  created_at: string;
  rejection_reason: string | null;
  match_venue_id: string | null;
  reviewed_at: string | null;
};

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' ? v : null;
}

function Field({ label, value }: { label: string; value: unknown }) {
  const display =
    value === null || value === undefined || value === ''
      ? null
      : Array.isArray(value)
        ? (value as unknown[]).map(String).join(', ')
        : typeof value === 'object'
          ? JSON.stringify(value, null, 2)
          : String(value);

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-caption font-semibold text-muted uppercase tracking-wider">{label}</span>
      {display !== null ? (
        <span className="text-body-sm text-foreground break-words">{display}</span>
      ) : (
        <span className="text-body-sm text-muted-light">—</span>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
      <h2 className="text-heading-sm font-semibold text-foreground mb-4">{title}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {children}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'pending')
    return <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-caption font-semibold bg-[#FEF3C7] text-[#92400E]">Pending</span>;
  if (status === 'merged')
    return <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-caption font-semibold bg-success-light text-success">Promoted</span>;
  if (status === 'rejected')
    return <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-caption font-semibold bg-background text-muted border border-border">Rejected</span>;
  return <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-caption font-semibold bg-background text-muted">{status}</span>;
}

export default async function StagingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createServiceClient();

  const [result, orgsResult] = await Promise.all([
    supabase
      .from('staging_venues')
      .select('id, external_ref, payload, status, source, source_run_id, created_at, rejection_reason, match_venue_id, reviewed_at')
      .eq('id', id)
      .single() as unknown as Promise<{ data: StagingDetailRow | null; error: unknown }>,
    supabase
      .from('organizations')
      .select('id, name, slug')
      .order('name', { ascending: true }),
  ]);

  if (result.error || !result.data) return notFound();
  const row: StagingDetailRow = result.data;
  const orgs = orgsResult.data ?? [];

  const p = (row.payload ?? {}) as Record<string, unknown>;
  const name = str(p.name) || str(p.title) || '(unnamed)';

  const socials: Record<string, string[]> = {};
  if (p.socials && typeof p.socials === 'object' && !Array.isArray(p.socials)) {
    for (const [k, v] of Object.entries(p.socials as Record<string, unknown>)) {
      if (Array.isArray(v)) socials[k] = (v as unknown[]).map(String);
    }
  }
  const emails: string[] = Array.isArray(p.emails) ? (p.emails as unknown[]).map(String) : [];
  const tags: string[] = Array.isArray(p.tags) ? (p.tags as unknown[]).map(String) : [];

  const thumbnailSrc = str(p.thumbnail_url) || str(p.imageUrl);
  const rating = numOrNull(p.rating) ?? numOrNull(p.totalScore);
  const reviewCount = numOrNull(p.reviewsCount) ?? numOrNull(p.reviewCount);

  return (
    <div className="min-h-screen bg-background">
      <UserBar />

      <main className="max-w-[var(--width-content)] mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/dashboard" className="text-body-sm text-muted hover:text-foreground transition-colors">
                Dashboard
              </Link>
              <span className="text-muted-light">/</span>
              <Link href="/admin" className="text-body-sm text-muted hover:text-foreground transition-colors">
                Admin Console
              </Link>
              <span className="text-muted-light">/</span>
              <Link href="/admin/staging" className="text-body-sm text-muted hover:text-foreground transition-colors">
                Staging
              </Link>
              <span className="text-muted-light">/</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-display-md font-bold text-foreground tracking-tight">{name}</h1>
              <StatusBadge status={row.status} />
            </div>
            <p className="text-body-sm text-muted mt-1 font-mono">{row.id}</p>
          </div>
          <Link href="/admin/staging">
            <span className="inline-flex items-center justify-center h-9 px-4 rounded-md border border-border bg-surface text-body-sm font-medium text-muted hover:text-foreground hover:bg-background transition-colors cursor-pointer">
              &larr; Staging
            </span>
          </Link>
        </div>

        <div className="flex flex-col gap-6">
          {/* Pending: actions + edit fields */}
          {row.status === 'pending' && (
            <StagingDetailClient
              key={row.id}
              rowId={row.id}
              hasNoExternalRef={!row.external_ref}
              orgs={orgs}
              payload={p}
            />
          )}

          {/* Review status banner */}
          {row.status !== 'pending' ? (
            <div className={`rounded-md border px-4 py-3 ${row.status === 'merged' ? 'border-success bg-success-light' : 'border-border bg-background'}`}>
              <p className="text-body-sm font-medium text-foreground">
                {row.status === 'merged' ? 'Promoted to live venue' : 'Rejected'}
              </p>
              {row.rejection_reason ? (
                <p className="text-body-sm text-muted mt-0.5">Reason: {row.rejection_reason}</p>
              ) : null}
              {row.match_venue_id ? (
                <p className="text-body-sm text-muted mt-0.5 font-mono">Venue ID: {row.match_venue_id}</p>
              ) : null}
              {row.reviewed_at ? (
                <p className="text-caption text-muted mt-0.5">
                  Reviewed {new Date(row.reviewed_at).toLocaleString()}
                </p>
              ) : null}
            </div>
          ) : null}

          {/* Thumbnail */}
          {thumbnailSrc ? (
            <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
              <h2 className="text-heading-sm font-semibold text-foreground mb-4">Thumbnail</h2>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={thumbnailSrc}
                alt={name}
                className="w-full max-w-sm h-48 object-cover rounded-md border border-border"
              />
            </div>
          ) : null}

          {/* Basic Info */}
          <Section title="Basic Info">
            <Field label="Name" value={str(p.name) || str(p.title)} />
            <Field label="Category" value={str(p.categoryName) || str(p.category) || str(p.primaryType)} />
            <Field label="Address" value={str(p.address)} />
            <Field label="City" value={str(p.city)} />
            <Field label="State" value={str(p.state)} />
            <Field label="Zip" value={str(p.zip)} />
            <Field label="Phone" value={str(p.phone) || str(p.phoneNumber)} />
            <Field label="Website" value={str(p.website)} />
            <Field label="Rating" value={rating} />
            <Field label="Reviews" value={reviewCount} />
            <Field label="Price tier" value={numOrNull(p.price_tier) ?? numOrNull(p.priceLevel)} />
            <Field label="Neighborhood" value={str(p.neighborhood)} />
          </Section>

          {/* Social Links */}
          <Section title="Social Links">
            <Field label="Instagram" value={str(p.instagram_url)} />
            <Field label="Facebook" value={str(p.facebook_url)} />
            <Field label="TikTok" value={str(p.tiktok_url)} />
            {Object.entries(socials).map(([platform, urls]) =>
              urls.length > 0 ? (
                <Field key={platform} label={platform} value={urls.join(', ')} />
              ) : null
            )}
            {emails.length > 0 ? <Field label="Emails" value={emails.join(', ')} /> : null}
          </Section>

          {/* Tags */}
          {tags.length > 0 ? (
            <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
              <h2 className="text-heading-sm font-semibold text-foreground mb-4">Tags</h2>
              <div className="flex flex-wrap gap-2">
                {tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center rounded-full px-2.5 py-0.5 text-body-sm font-medium bg-background border border-border text-muted"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {/* Scraper Metadata */}
          <Section title="Scraper Metadata">
            <Field label="Source" value={row.source} />
            <Field label="Run ID" value={row.source_run_id} />
            <Field label="Places ID" value={row.external_ref} />
            <Field label="Created" value={new Date(row.created_at).toLocaleString()} />
          </Section>

          {/* Raw Payload */}
          <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
            <h2 className="text-heading-sm font-semibold text-foreground mb-4">Raw Payload</h2>
            <pre className="text-caption text-muted bg-background rounded-md border border-border p-4 overflow-x-auto max-h-96">
              {JSON.stringify(row.payload, null, 2)}
            </pre>
          </div>
        </div>
      </main>
    </div>
  );
}
