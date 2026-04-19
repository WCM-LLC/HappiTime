-- Add slug column to venues for SEO-friendly URLs
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS slug text;

-- Backfill: lowercase name, replace non-alphanumeric with hyphens
UPDATE public.venues
SET slug = trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'))
WHERE slug IS NULL;

-- Handle duplicate slugs by appending a row number suffix
WITH dupes AS (
  SELECT id, slug, row_number() OVER (PARTITION BY slug ORDER BY created_at) AS rn
  FROM public.venues
)
UPDATE public.venues v
SET slug = v.slug || '-' || d.rn
FROM dupes d
WHERE v.id = d.id AND d.rn > 1;

ALTER TABLE public.venues ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS venues_slug_idx ON public.venues (slug);
