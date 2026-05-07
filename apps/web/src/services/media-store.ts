import type { SupabaseClient } from '@supabase/supabase-js';

export type MediaType = 'image' | 'video' | 'menu_pdf';

export type MediaRow = {
  id: string;
  type: MediaType;
  title: string | null;
  storage_bucket: string;
  storage_path: string;
  sort_order: number;
  source: string;
  status: string;
  created_at: string;
};

export type MediaInsert = {
  org_id: string;
  venue_id: string;
  type: MediaType;
  title: string | null;
  storage_bucket?: string;
  storage_path: string;
  sort_order?: number;
};

type MediaTableName = 'venue_media' | 'media_assets';

type MediaResult<T> = {
  data: T;
  error: string | null;
  table: MediaTableName | null;
};

const MISSING_TABLE_MESSAGE =
  'Media metadata table not found. Run the latest Supabase migrations.';

let cachedTable: MediaTableName | null = null;

function isMissingTableError(error: any): boolean {
  const code = String(error?.code ?? '');
  const status = Number(error?.status ?? 0);
  const message = String(error?.message ?? '').toLowerCase();

  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    status === 404 ||
    message.includes('does not exist') ||
    message.includes('not found')
  );
}

async function tableExists(
  supabase: SupabaseClient,
  table: MediaTableName
): Promise<boolean> {
  const { error } = await supabase.from(table).select('id').limit(1);
  if (!error) return true;
  if (isMissingTableError(error)) return false;
  return true;
}

async function resolveMediaTable(supabase: SupabaseClient): Promise<MediaTableName | null> {
  if (cachedTable) return cachedTable;

  const envTable = process.env.NEXT_PUBLIC_MEDIA_METADATA_TABLE;
  if (envTable === 'media_assets' || envTable === 'venue_media') {
    cachedTable = envTable;
    return cachedTable;
  }

  const preferred: MediaTableName[] = ['venue_media', 'media_assets'];
  for (const candidate of preferred) {
    if (await tableExists(supabase, candidate)) {
      cachedTable = candidate;
      return cachedTable;
    }
  }

  return null;
}

export async function listVenueMedia(
  supabase: SupabaseClient,
  orgId: string,
  venueId: string
): Promise<MediaResult<MediaRow[]>> {
  const table = await resolveMediaTable(supabase);
  if (!table) {
    return { data: [], error: MISSING_TABLE_MESSAGE, table: null };
  }

  let query = supabase
    .from(table)
    .select('id,type,title,storage_bucket,storage_path,sort_order,source,status,created_at')
    .eq('venue_id', venueId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  // Legacy table includes org_id; canonical table relies on venue-level RLS.
  if (table === 'media_assets') {
    query = query.eq('org_id', orgId);
  }

  const { data, error } = await query;

  if (error) {
    return { data: [], error: error.message ?? 'media_query_failed', table };
  }

  return { data: (data as MediaRow[]) ?? [], error: null, table };
}

export async function insertVenueMedia(
  supabase: SupabaseClient,
  payload: MediaInsert
): Promise<MediaResult<null>> {
  const table = await resolveMediaTable(supabase);
  if (!table) {
    return { data: null, error: MISSING_TABLE_MESSAGE, table: null };
  }

  const insertPayload =
    table === 'media_assets'
      ? payload
      : {
          venue_id: payload.venue_id,
          type: payload.type,
          title: payload.title,
          storage_path: payload.storage_path,
          sort_order: payload.sort_order ?? 999,
          source: 'upload',
          status: 'published',
          storage_bucket: payload.storage_bucket ?? 'cloudinary',
        };

  const { error } = await supabase.from(table).insert(insertPayload);
  if (error) {
    return { data: null, error: error.message ?? 'media_insert_failed', table };
  }

  return { data: null, error: null, table };
}

export async function deleteVenueMedia(
  supabase: SupabaseClient,
  id: string,
  storagePath: string,
  storageBucket = 'venue-media'
): Promise<{ error: string | null }> {
  // Cloudinary rows: physical file deletion handled by deleteCloudinaryAsset server action.
  if (storageBucket !== 'cloudinary') {
    const { error: storageError } = await supabase.storage
      .from(storageBucket)
      .remove([storagePath]);
    if (storageError) {
      return { error: storageError.message ?? 'storage_delete_failed' };
    }
  }

  const table = await resolveMediaTable(supabase);
  if (!table) {
    return { error: MISSING_TABLE_MESSAGE };
  }

  const { error: dbError } = await supabase.from(table).delete().eq('id', id);
  if (dbError) {
    return { error: dbError.message ?? 'db_delete_failed' };
  }

  return { error: null };
}

export async function setCoverPhoto(
  supabase: SupabaseClient,
  coverId: string,
  allRows: Array<{ id: string }>
): Promise<{ error: string | null }> {
  const table = await resolveMediaTable(supabase);
  if (!table) {
    return { error: MISSING_TABLE_MESSAGE };
  }

  const others = allRows.filter((r) => r.id !== coverId);
  const updates = [
    { id: coverId, sort_order: 0 },
    ...others.map((row, idx) => ({ id: row.id, sort_order: idx + 1 })),
  ];

  for (const u of updates) {
    const { error } = await supabase
      .from(table)
      .update({ sort_order: u.sort_order })
      .eq('id', u.id);
    if (error) return { error: error.message ?? 'reorder_failed' };
  }

  return { error: null };
}
