/** Converts a string to a URL-safe slug; returns 'organization' if the result would be empty. */
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
