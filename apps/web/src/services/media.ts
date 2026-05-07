export type MediaProvider = 'supabase' | 'cloudinary' | 'imgix' | 'none';

const CLOUDINARY_CLOUD = 'dhucspghz';

/**
 * Construct a URL for a venue_media row, respecting storage_bucket and type.
 * Cloudinary rows get optimized CDN URLs; legacy Supabase rows get storage URLs.
 * PDFs use /raw/upload/ (no transforms); videos use /video/upload/.
 */
export function venueImageUrl(
  media: { storage_bucket: string; storage_path: string; type?: string },
  opts: { w?: number; h?: number; crop?: 'limit' | 'fill' } = {}
): string {
  if (media.storage_bucket === 'cloudinary') {
    if (media.type === 'menu_pdf') {
      return `https://res.cloudinary.com/${CLOUDINARY_CLOUD}/raw/upload/${media.storage_path}`;
    }
    const resourceType = media.type === 'video' ? 'video' : 'image';
    const transforms = ['f_auto', 'q_auto'];
    if (opts.w || opts.h) {
      transforms.push(`c_${opts.crop ?? 'limit'}`);
      if (opts.w) transforms.push(`w_${opts.w}`);
      if (opts.h) transforms.push(`h_${opts.h}`);
    }
    return `https://res.cloudinary.com/${CLOUDINARY_CLOUD}/${resourceType}/upload/${transforms.join(',')}/${media.storage_path}`;
  }
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
  return `${supabaseUrl}/storage/v1/object/public/${media.storage_bucket}/${media.storage_path}`;
}

export type ImageTransformOptions = {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'auto' | 'jpeg' | 'png' | 'webp' | 'avif';
  bucket?: string;
};

function normalizeProvider(value: string | undefined): MediaProvider {
  const v = (value ?? '').trim().toLowerCase();
  if (v === 'cloudinary' || v === 'imgix' || v === 'supabase') return v;
  return 'none';
}

function stripSlashes(value: string) {
  return value.replace(/^\/+|\/+$/g, '');
}

function joinUrl(base: string, path: string) {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

export function getMediaPublicUrl(path: string, bucket = 'venue-media'): string | null {
  if (!path) return null;

  const cdnBase = process.env.NEXT_PUBLIC_MEDIA_CDN_BASE_URL;
  if (cdnBase) {
    return joinUrl(cdnBase, stripSlashes(path));
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return null;

  const base = `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/${stripSlashes(
    bucket
  )}`;
  return joinUrl(base, stripSlashes(path));
}

export function getOptimizedImageUrl(
  path: string,
  options: ImageTransformOptions = {}
): string | null {
  if (!path) return null;

  const provider = normalizeProvider(process.env.NEXT_PUBLIC_MEDIA_PROVIDER);
  const cdnBase = process.env.NEXT_PUBLIC_MEDIA_CDN_BASE_URL ?? '';
  const bucket = options.bucket ?? 'venue-media';

  if (provider === 'cloudinary' && cdnBase) {
    const transforms: string[] = [];
    if (options.width) transforms.push(`w_${options.width}`);
    if (options.height) transforms.push(`h_${options.height}`);
    if (options.quality) transforms.push(`q_${options.quality}`);
    transforms.push(`f_${options.format ?? 'auto'}`);
    const transformPath = transforms.join(',');
    return joinUrl(cdnBase, `image/upload/${transformPath}/${stripSlashes(path)}`);
  }

  if (provider === 'imgix' && cdnBase) {
    const params = new URLSearchParams();
    if (options.width) params.set('w', String(options.width));
    if (options.height) params.set('h', String(options.height));
    if (options.quality) params.set('q', String(options.quality));
    if (options.format) params.set('fm', options.format);
    const baseUrl = joinUrl(cdnBase, stripSlashes(path));
    const query = params.toString();
    return query ? `${baseUrl}?${query}` : baseUrl;
  }

  if (provider === 'supabase') {
    return getMediaPublicUrl(path, bucket);
  }

  return getMediaPublicUrl(path, bucket);
}
