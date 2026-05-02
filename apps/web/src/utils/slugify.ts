export function slugify(input: string) {
  const slug = input
    .toLowerCase()
    .trim()
    .replace(/['’`´]+/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');

  return slug || 'organization';
}
