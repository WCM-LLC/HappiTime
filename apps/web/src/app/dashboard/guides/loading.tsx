import { Loader2 } from 'lucide-react';

// Shown while a guides route segment renders (including the navigation that
// follows a save/submit redirect), so the screen never looks frozen or blank
// between clicking a button and the next page appearing.
export default function GuidesLoading() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex items-center gap-3 text-muted" role="status" aria-live="polite">
        <Loader2 className="h-5 w-5 animate-spin text-brand" />
        <span className="text-body-sm">Loading…</span>
      </div>
    </div>
  );
}
