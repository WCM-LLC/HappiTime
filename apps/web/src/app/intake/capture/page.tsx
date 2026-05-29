/**
 * /intake/capture
 *
 * Phone-friendly field capture flow:
 *   1. Pick (or search) a venue.
 *   2. Snap a photo of a happy-hour sign / chalkboard / menu.
 *   3. Server runs Claude vision → returns proposed windows + offers.
 *   4. Review & edit on-screen.
 *   5. Toggle "Send owner a confirmation link" (off = auto-publish, on = draft + email).
 *   6. Commit.
 *
 * Auth: admin-only (matches /api/intake/* gates).
 */
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { isAdminEmail } from '@/utils/admin-emails';
import { isIntakeConfirmConfigured } from '@/utils/intake-token';
import CaptureClient from './CaptureClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function CapturePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login?next=/intake/capture');
  if (!(await isAdminEmail(user.email))) redirect('/');

  return <CaptureClient confirmationConfigured={isIntakeConfirmConfigured()} />;
}
