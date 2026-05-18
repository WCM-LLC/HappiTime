import Link from 'next/link';
import { notFound } from 'next/navigation';
import UserBar from '@/components/layout/UserBar';
import { createClient } from '@/utils/supabase/server';
import { GuideEditor } from '../../components/GuideEditor';

const NOTICE: Record<string, string> = {
  draft_saved: 'Draft saved.',
};
const ERRORS: Record<string, string> = {
  save_failed: 'Save failed — try again.',
  submit_failed: 'Submit failed — try again.',
};

export default async function EditGuidePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const noticeText = sp.notice ? (NOTICE[sp.notice] ?? null) : null;
  const errorText = sp.error ? (ERRORS[sp.error] ?? sp.error) : null;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();

  const { data: guide } = await supabase
    .from('guides')
    .select('id, title, subtitle, body_md, city, tags, cover_image_url, status, slug')
    .eq('id', id)
    .eq('author_id', auth.user!.id)
    .maybeSingle();

  if (!guide) notFound();

  const g = guide as any;

  return (
    <div className="min-h-screen bg-background">
      <UserBar />

      <main className="max-w-[var(--width-content)] mx-auto px-6 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <Link href="/dashboard" className="text-body-sm text-muted hover:text-foreground transition-colors">
              Dashboard
            </Link>
            <span className="text-muted-light">/</span>
            <Link href="/dashboard/guides" className="text-body-sm text-muted hover:text-foreground transition-colors">
              Guides
            </Link>
            <span className="text-muted-light">/</span>
            <span className="text-body-sm text-foreground truncate max-w-[200px]">{g.title}</span>
          </div>
          <h1 className="text-display-md font-bold text-foreground tracking-tight">Edit guide</h1>
          <p className="text-body-sm text-muted mt-1">
            Slug: <code className="text-caption bg-surface px-1.5 py-0.5 rounded border border-border">{g.slug}</code>
          </p>
        </div>

        <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
          <GuideEditor
            id={g.id}
            initialTitle={g.title}
            initialSubtitle={g.subtitle ?? ''}
            initialBodyMd={g.body_md}
            initialCity={g.city ?? ''}
            initialTags={(g.tags ?? []).join(', ')}
            initialCoverUrl={g.cover_image_url ?? ''}
            status={g.status}
            noticeText={noticeText}
            errorText={errorText}
          />
        </div>
      </main>
    </div>
  );
}
