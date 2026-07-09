import Link from 'next/link';
import { redirect } from 'next/navigation';
import UserBar from '@/components/layout/UserBar';
import { createClient } from '@/utils/supabase/server';
import { saveProfileSocials } from '@/actions/profile-actions';

const SOCIAL_FIELDS = [
  { name: 'instagram_url', label: 'Instagram', placeholder: 'https://instagram.com/you' },
  { name: 'tiktok_url', label: 'TikTok', placeholder: 'https://tiktok.com/@you' },
  { name: 'website_url', label: 'Website', placeholder: 'https://yoursite.com' },
  { name: 'youtube_url', label: 'YouTube', placeholder: 'https://youtube.com/@you' },
] as const;

const inputCls =
  'flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-body-sm text-foreground placeholder:text-muted-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand transition-colors';

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/super-user/login');

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('instagram_url, tiktok_url, website_url, youtube_url')
    .eq('user_id', auth.user.id)
    .maybeSingle();

  return (
    <div className="min-h-screen bg-background">
      <UserBar />
      <main className="max-w-[var(--width-content)] mx-auto px-6 py-8">
        <div className="mb-8">
          <Link href="/dashboard" className="text-body-sm text-muted hover:text-foreground">
            ← Dashboard
          </Link>
          <h1 className="text-display-md font-bold text-foreground tracking-tight mt-2">Your socials</h1>
          <p className="text-body-sm text-muted mt-1">
            These links appear on every guide you publish.
          </p>
        </div>

        {sp?.ok ? (
          <div className="rounded-md border border-brand bg-brand-subtle px-4 py-3 mb-6">
            <p className="text-body-sm font-medium text-brand-dark">Saved.</p>
          </div>
        ) : null}
        {sp?.error ? (
          <div className="rounded-md border border-error bg-error-light px-4 py-3 mb-6">
            <p className="text-body-sm font-medium text-error">Could not save</p>
            <p className="text-body-sm text-error/80 mt-0.5">{sp.error}</p>
          </div>
        ) : null}

        <form action={saveProfileSocials} className="rounded-lg border border-border bg-surface p-6 shadow-sm max-w-xl">
          <div className="flex flex-col gap-4">
            {SOCIAL_FIELDS.map((f) => (
              <div key={f.name}>
                <label htmlFor={f.name} className="text-body-sm font-medium text-foreground block mb-1.5">
                  {f.label}
                </label>
                <input
                  id={f.name}
                  name={f.name}
                  type="url"
                  placeholder={f.placeholder}
                  defaultValue={(profile as any)?.[f.name] ?? ''}
                  className={inputCls}
                />
              </div>
            ))}
          </div>
          <button
            type="submit"
            className="mt-6 inline-flex items-center justify-center h-10 px-5 rounded-md bg-brand text-white text-body-sm font-medium hover:bg-brand-dark transition-colors cursor-pointer"
          >
            Save socials
          </button>
        </form>
      </main>
    </div>
  );
}
