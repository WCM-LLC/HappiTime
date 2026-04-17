'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import { createServiceClient, getServiceRoleKeyError } from '@/utils/supabase/server';

async function assertAdmin() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const email = auth.user?.email?.toLowerCase() ?? '';
  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (adminEmails.length > 0 && !adminEmails.includes(email)) {
    throw new Error('Unauthorized');
  }
}

function getAdminClient() {
  if (getServiceRoleKeyError()) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  }
  return createServiceClient();
}

export async function adminToggleWindow(windowId: string, currentStatus: string) {
  await assertAdmin();
  const supabase = getAdminClient();
  const next = currentStatus === 'published' ? 'draft' : 'published';
  const { error } = await supabase
    .from('happy_hour_windows')
    .update({ status: next })
    .eq('id', windowId);
  if (error) throw new Error(error.message);
  revalidatePath('/admin');
}

export async function adminToggleVenueStatus(venueId: string, currentStatus: string | null) {
  await assertAdmin();
  const supabase = getAdminClient();
  const next = currentStatus === 'published' ? 'draft' : 'published';
  const { error } = await supabase
    .from('venues')
    .update({ status: next })
    .eq('id', venueId);
  if (error) throw new Error(error.message);
  revalidatePath('/admin');
}
