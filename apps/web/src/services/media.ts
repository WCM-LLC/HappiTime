export type MediaProvider = 'supabase' | 'cloudinary' | 'imgix' | 'none';

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
