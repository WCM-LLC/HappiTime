import Link from 'next/link';
import { redirect } from 'next/navigation';
import UserBar from '@/components/layout/UserBar';
import { createClient } from '@/utils/supabase/server';
import { deleteDraft, submitGuide } from '@/actions/guide-actions';
import { GUIDE_AUTHORING_PATH, loginPathFor } from '@/utils/auth-paths';

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  pending_review: 'In review',
  published: 'Published',
  archived: 'Archived',
};

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-surface border border-border text-muted',
  pending_review: 'bg-warning-light border border-warning text-warning',
  published: 'bg-success-light border border-success text-success',
  archived: 'bg-surface border border-border text-muted-light',
};

const NOTICE: Record<string, string> = {
  draft_saved: 'Draft saved.',
  draft_deleted: 'Draft deleted.',
  guide_submitted: 'Guide submitted for review.',
  guide_published: 'Guide published.',
};

const ERRORS: Record<string, string> = {
  title_required: 'A title is required.',
  body_required: 'Add some body text before saving.',
  save_failed: 'Save failed — try again.',
  submit_failed: 'Submit failed — try again.',
  delete_failed: 'Delete failed — try again.',
  guide_not_found: 'Guide not found.',
  already_published: 'This guide is already published.',
  missing_guide_id: 'No guide selected.',
  not_authorized: 'You need Super User access to author guides.',
  cover_file_too_large: 'Cover image must be 5 MB or smaller.',
  cover_file_type: 'Cover image must be AVIF, WebP, JPG, or PNG.',
  cover_upload_failed: 'Cover image upload failed — try again.',
};

export default async function GuidesListPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const noticeText = sp.notice ? (NOTICE[sp.notice] ?? null) : null;
  const errorText = sp.error ? (ERRORS[sp.error] ?? sp.error) : null;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;

  if (!user) {
    redirect(loginPathFor(GUIDE_AUTHORING_PATH));
  }

  const { data: guides } = await supabase
    .from('guides')
    .select('id, title, slug, status, city, tags, created_at, updated_at')
    .eq('author_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(100);

  const rows = (guides ?? []) as any[];

  return (
    <div className="min-h-screen bg-background">
      <UserBar />

      <main className="max-w-[var(--width-content)] mx-auto px-6 py-8">
        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/dashboard" className="text-body-sm text-muted hover:text-foreground transition-colors">
                Dashboard
              </Link>
              <span className="text-muted-light">/</span>
              <span className="text-body-sm text-foreground">Guides</span>
            </div>
            <h1 className="text-display-md font-bold text-foreground tracking-tight">My Guides</h1>
            <p className="text-body-sm text-muted mt-1">
              {rows.length} guide{rows.length !== 1 ? 's' : ''}
            </p>
          </div>
          <Link href="/dashboard/guides/new">
            <span className="inline-flex items-center justify-center h-9 px-4 rounded-md bg-brand text-white text-body-sm font-medium hover:bg-brand-dark transition-colors cursor-pointer">
              + New guide
            </span>
          </Link>
        </div>

        {noticeText ? (
          <div className="rounded-md border border-success bg-success-light px-4 py-3 mb-6">
            <p className="text-body-sm font-medium text-success">{noticeText}</p>
          </div>
        ) : null}

        {errorText ? (
          <div className="rounded-md border border-error bg-error-light px-4 py-3 mb-6">
            <p className="text-body-sm font-medium text-error">{errorText}</p>
          </div>
        ) : null}

        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border-strong bg-surface/50 p-12 text-center">
            <p className="text-body-sm font-medium text-foreground mb-1">No guides yet</p>
            <p className="text-body-sm text-muted mb-4">Write your first guide to share with the HappiTime community.</p>
            <Link href="/dashboard/guides/new">
              <span className="inline-flex items-center justify-center h-9 px-4 rounded-md bg-brand text-white text-body-sm font-medium hover:bg-brand-dark transition-colors cursor-pointer">
                + New guide
              </span>
            </Link>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-surface shadow-sm overflow-hidden">
            <table className="w-full text-body-sm">
              <thead>
                <tr className="border-b border-border bg-background/50">
                  <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider">Title</th>
                  <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider hidden sm:table-cell">City</th>
                  <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider hidden md:table-cell">Updated</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((g) => {
                  const status: string = g.status ?? 'draft';
                  const canEdit = status === 'draft' || status === 'pending_review';
                  const canSubmit = status === 'draft';
                  const canDelete = status === 'draft';

                  return (
                    <tr key={g.id} className="border-b border-border last:border-0 hover:bg-background/40 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-medium text-foreground">{g.title}</span>
                        <span className="block text-caption text-muted-light mt-0.5">{g.slug}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-caption font-semibold ${STATUS_STYLE[status] ?? STATUS_STYLE.draft}`}>
                          {STATUS_LABEL[status] ?? status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted hidden sm:table-cell">{g.city ?? '—'}</td>
                      <td className="px-4 py-3 text-muted hidden md:table-cell">
                        {new Date(g.updated_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3 justify-end">
                          {canEdit ? (
                            <Link href={`/dashboard/guides/${g.id}/edit`}>
                              <span className="text-caption font-medium text-brand hover:underline cursor-pointer">Edit</span>
                            </Link>
                          ) : null}
                          {canSubmit ? (
                            <form>
                              <input type="hidden" name="id" value={g.id} />
                              <button
                                formAction={submitGuide}
                                className="text-caption font-medium text-foreground hover:underline cursor-pointer"
                              >
                                Submit
                              </button>
                            </form>
                          ) : null}
                          {canDelete ? (
                            <form>
                              <input type="hidden" name="id" value={g.id} />
                              <button
                                formAction={deleteDraft}
                                className="text-caption font-medium text-error hover:underline cursor-pointer"
                              >
                                Delete
                              </button>
                            </form>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
