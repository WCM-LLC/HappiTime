import Link from 'next/link';
import UserBar from '@/components/layout/UserBar';
import { GuideEditor } from '../components/GuideEditor';

export default function NewGuidePage() {
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
            <span className="text-body-sm text-foreground">New</span>
          </div>
          <h1 className="text-display-md font-bold text-foreground tracking-tight">New guide</h1>
          <p className="text-body-sm text-muted mt-1">
            Saving creates a draft. Submit when you&apos;re ready for review.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
          <GuideEditor />
        </div>
      </main>
    </div>
  );
}
