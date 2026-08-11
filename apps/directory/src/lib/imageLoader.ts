// Custom next/image loader (wired via next.config images.loaderFile).
// Cloudinary is already our image CDN — rewrite its transform segment per
// requested width so next/image emits a responsive srcset served by
// Cloudinary directly, instead of paying for Vercel image optimization on
// top of it. Non-Cloudinary URLs (Supabase storage, local assets) pass
// through untouched.
// Transform segment = comma-separated short-key tokens (f_auto,q_auto,w_640).
// Keys are 1-3 chars, which keeps folder names like `venue_photos/` from
// being mistaken for transforms.
const CLOUDINARY_UPLOAD_RE =
  /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(?:([a-z]{1,3}_[^/]+)\/)?(.+)$/;

export default function imageLoader({
  src,
  width,
  quality,
}: {
  src: string;
  width: number;
  quality?: number;
}): string {
  const match = CLOUDINARY_UPLOAD_RE.exec(src);
  if (!match) return src;
  const [, prefix, , rest] = match;
  const q = quality ? `q_${quality}` : "q_auto";
  return `${prefix}f_auto,${q},c_limit,w_${width}/${rest}`;
}
