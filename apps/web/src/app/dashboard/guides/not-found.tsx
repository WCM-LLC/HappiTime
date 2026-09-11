import Link from 'next/link';

// Graceful 404 for the guides flow (e.g. editing a guide you don't own or that
// no longer exists). Without this, notFound() renders a bare default page.
export default function GuidesNotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="max-w-md w-full rounded-lg border border-border bg-surface p-6 shadow-sm text-center">
        <h1 className="text-display-sm font-bold text-foreground mb-2">Guide not found</h1>
        <p className="text-body-sm text-muted mb-4">
          This guide doesn&apos;t exist, or it isn&apos;t yours to edit.
        </p>
        <Link
          href="/dashboard/guides"
          className="inline-flex items-center justify-center h-10 px-5 rounded-md bg-brand text-white text-body-sm font-medium hover:bg-brand-dark transition-colors"
        >
          Back to my guides
        </Link>
      </div>
    </div>
  );
}
