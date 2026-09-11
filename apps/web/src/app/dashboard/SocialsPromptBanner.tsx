import Link from 'next/link';
import { dismissSocialsPrompt } from '@/actions/profile-actions';

export default function SocialsPromptBanner() {
  return (
    <div className="rounded-md border border-brand bg-brand-subtle px-4 py-3 mb-6 flex items-center justify-between gap-4">
      <p className="text-body-sm text-brand-dark">
        Add your socials so they appear on every guide you publish.
      </p>
      <div className="flex items-center gap-2 shrink-0">
        <Link
          href="/dashboard/profile"
          className="inline-flex items-center justify-center h-8 px-3 rounded-md bg-brand text-white text-caption font-medium hover:bg-brand-dark transition-colors"
        >
          Add socials
        </Link>
        <form action={dismissSocialsPrompt}>
          <button
            type="submit"
            className="inline-flex items-center justify-center h-8 px-3 rounded-md text-caption font-medium text-muted hover:text-foreground border border-border transition-colors cursor-pointer"
          >
            Dismiss
          </button>
        </form>
      </div>
    </div>
  );
}
