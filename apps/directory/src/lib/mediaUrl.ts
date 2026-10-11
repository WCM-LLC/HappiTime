const CLOUDINARY_CLOUD = 'dhucspghz';

export function venueImageUrl(
  media: { storage_bucket: string; storage_path: string; type?: string },
  opts: { w?: number; h?: number; crop?: 'limit' | 'fill'; format?: 'webp' | 'jpg' } = {}
): string {
  if (media.storage_bucket === 'cloudinary') {
    if (media.type === 'menu_pdf') {
      return `https://res.cloudinary.com/${CLOUDINARY_CLOUD}/raw/upload/${media.storage_path}`;
    }
    const resourceType = media.type === 'video' ? 'video' : 'image';
    // Videos keep f_auto (Cloudinary picks the codec). Images pin WebP: f_auto
    // returns JPEG to clients that send no Accept header — see imageLoader.ts.
    const transforms = [resourceType === 'video' ? 'f_auto' : `f_${opts.format ?? 'webp'}`, 'q_auto'];
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
