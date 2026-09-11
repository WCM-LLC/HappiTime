// CSV export of CRM leads. Admin-only (isAdmin guard) + service-role read.
import { NextResponse } from 'next/server';
import { isAdmin } from '@/utils/admin';
import { createServiceClient, getServiceRoleKeyError } from '@/utils/supabase/server';

export const dynamic = 'force-dynamic';

const COLUMNS = [
  'id', 'name', 'stage', 'priority', 'interested_tier', 'lead_source',
  'estimated_monthly_value_cents', 'city', 'neighborhood', 'website', 'phone', 'email',
  'next_follow_up_at', 'lost_reason', 'venue_id', 'organization_id', 'created_at', 'updated_at',
] as const;

function csvEscape(value: unknown): string {
  if (value == null) return '';
  const s = String(value);
  // Prefix formula-triggering characters so spreadsheet apps don't execute them.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export async function GET() {
  if (!(await isAdmin())) {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  if (getServiceRoleKeyError()) {
    return new NextResponse('Service role key not configured', { status: 500 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('crm_leads')
    .select(COLUMNS.join(','))
    .order('created_at', { ascending: false })
    .limit(5000);

  if (error) {
    return new NextResponse(`Export failed: ${error.message}`, { status: 500 });
  }

  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const lines = [
    COLUMNS.join(','),
    ...rows.map((row) => COLUMNS.map((c) => csvEscape(row[c])).join(',')),
  ];

  return new NextResponse(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="happitime-crm-leads-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
