BEGIN;

-- Normalize organization display names for safe duplicate detection.
-- This intentionally removes punctuation/apostrophes while preserving words,
-- so names like "O'Dowd's" and "Odowds" share a key.
CREATE OR REPLACE FUNCTION public.normalize_organization_name(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO public, pg_temp
AS $$
  SELECT nullif(
    btrim(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(lower(coalesce(input, '')), '[' || chr(39) || '’`´]+', '', 'g'),
            '&',
            ' and ',
            'g'
          ),
          '[^a-z0-9]+',
          ' ',
          'g'
        ),
        '[[:space:]]+',
        ' ',
        'g'
      )
    ),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION public.organization_slugify(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO public, pg_temp
AS $$
  SELECT coalesce(
    nullif(
      btrim(
        regexp_replace(
          regexp_replace(
            regexp_replace(lower(coalesce(input, '')), '[' || chr(39) || '’`´]+', '', 'g'),
            '[^a-z0-9]+',
            '-',
            'g'
          ),
          '-+',
          '-',
          'g'
        ),
        '-'
      ),
      ''
    ),
    'organization'
  );
$$;

COMMENT ON FUNCTION public.normalize_organization_name(text)
  IS 'Canonicalizes organization names for duplicate detection and post-migration smoke checks.';

COMMENT ON FUNCTION public.organization_slugify(text)
  IS 'Deterministic organization slug generation used to repair missing or duplicate slugs before enforcing uniqueness.';

CREATE TABLE IF NOT EXISTS public.organization_merge_audit (
  id bigserial PRIMARY KEY,
  duplicate_organization_id uuid NOT NULL,
  canonical_organization_id uuid NOT NULL,
  duplicate_organization_name text NOT NULL,
  canonical_organization_name text NOT NULL,
  normalized_name text NOT NULL,
  merged_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.organization_merge_audit ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS organization_merge_audit_duplicate_org_idx
  ON public.organization_merge_audit (duplicate_organization_id);

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS slug text;

-- Repair only missing, blank, invalid, or duplicated slugs before adding the
-- partial unique index. Existing valid custom slugs are preserved.
CREATE TEMP TABLE tmp_organization_slug_repairs ON COMMIT DROP AS
WITH duplicate_slugs AS (
  SELECT slug
  FROM public.organizations
  WHERE slug IS NOT NULL
    AND btrim(slug) <> ''
  GROUP BY slug
  HAVING count(*) > 1
),
desired AS (
  SELECT
    o.id,
    o.slug,
    o.created_at,
    public.organization_slugify(o.name) AS base_slug
  FROM public.organizations o
),
needs_repair AS (
  SELECT
    d.id,
    d.base_slug,
    d.created_at
  FROM desired d
  LEFT JOIN duplicate_slugs ds ON ds.slug = d.slug
  WHERE d.slug IS NULL
     OR btrim(d.slug) = ''
     OR d.slug !~ '^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$'
     OR ds.slug IS NOT NULL
),
repair_candidates AS (
  SELECT
    nr.id,
    nr.base_slug,
    row_number() OVER (PARTITION BY nr.base_slug ORDER BY nr.created_at ASC, nr.id ASC) AS repair_rank
  FROM needs_repair nr
),
available_slugs AS (
  SELECT
    rc.id,
    candidate.slug,
    row_number() OVER (PARTITION BY rc.id ORDER BY candidate.n ASC) AS available_rank
  FROM repair_candidates rc
  CROSS JOIN LATERAL generate_series(1, 10000) AS candidate_rank(n)
  CROSS JOIN LATERAL (
    SELECT
      candidate_rank.n,
      CASE
        WHEN candidate_rank.n = 1 THEN rc.base_slug
        ELSE rc.base_slug || '-' || candidate_rank.n::text
      END AS slug
  ) candidate
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.organizations o
    WHERE o.id NOT IN (SELECT id FROM repair_candidates)
      AND o.slug = candidate.slug
  )
)
SELECT rc.id, a.slug AS target_slug
FROM repair_candidates rc
JOIN available_slugs a
  ON a.id = rc.id
 AND a.available_rank = rc.repair_rank;

UPDATE public.organizations o
SET slug = 'org-repair-' || replace(o.id::text, '-', '')
FROM tmp_organization_slug_repairs r
WHERE o.id = r.id;

UPDATE public.organizations o
SET slug = r.target_slug
FROM tmp_organization_slug_repairs r
WHERE o.id = r.id;

ALTER TABLE public.organizations
  ALTER COLUMN slug SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS organizations_slug_unique_not_null
  ON public.organizations (slug)
  WHERE slug IS NOT NULL;

-- Do not add a normalized-name unique index here. HappiTime's durable URL
-- identity is slug; display names remain editable labels.

CREATE TEMP TABLE tmp_organization_merge_map ON COMMIT DROP AS
WITH org_stats AS (
  SELECT
    o.id,
    o.name,
    o.slug,
    o.created_at,
    public.normalize_organization_name(o.name) AS normalized_name,
    count(DISTINCT v.id) AS venue_count,
    count(DISTINCT om.user_id) AS member_count
  FROM public.organizations o
  LEFT JOIN public.venues v ON v.org_id = o.id
  LEFT JOIN public.org_members om ON om.org_id = o.id
  GROUP BY o.id, o.name, o.slug, o.created_at
),
ranked AS (
  SELECT
    os.*,
    first_value(os.id) OVER canonical_choice AS canonical_organization_id,
    first_value(os.name) OVER canonical_choice AS canonical_organization_name,
    count(*) OVER (PARTITION BY os.normalized_name) AS group_size
  FROM org_stats os
  WHERE os.normalized_name IS NOT NULL
  WINDOW canonical_choice AS (
    PARTITION BY os.normalized_name
    ORDER BY os.venue_count DESC, os.member_count DESC, os.created_at ASC, os.id ASC
    ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
  )
)
SELECT
  id AS duplicate_organization_id,
  canonical_organization_id,
  name AS duplicate_organization_name,
  canonical_organization_name,
  normalized_name
FROM ranked
WHERE group_size > 1
  AND id <> canonical_organization_id;

CREATE INDEX tmp_organization_merge_map_duplicate_idx
  ON tmp_organization_merge_map (duplicate_organization_id);

CREATE INDEX tmp_organization_merge_map_canonical_idx
  ON tmp_organization_merge_map (canonical_organization_id);

INSERT INTO public.organization_merge_audit (
  duplicate_organization_id,
  canonical_organization_id,
  duplicate_organization_name,
  canonical_organization_name,
  normalized_name,
  merged_at
)
SELECT
  duplicate_organization_id,
  canonical_organization_id,
  duplicate_organization_name,
  canonical_organization_name,
  normalized_name,
  now()
FROM tmp_organization_merge_map
ON CONFLICT (duplicate_organization_id) DO NOTHING;

CREATE TEMP TABLE tmp_consolidated_org_members ON COMMIT DROP AS
WITH affected_members AS (
  SELECT
    coalesce(m.canonical_organization_id, om.org_id) AS target_org_id,
    om.org_id AS source_org_id,
    om.user_id,
    om.role,
    om.email,
    om.first_name,
    om.last_name,
    om.created_at,
    om.updated_at
  FROM public.org_members om
  LEFT JOIN tmp_organization_merge_map m
    ON m.duplicate_organization_id = om.org_id
  WHERE om.org_id IN (SELECT duplicate_organization_id FROM tmp_organization_merge_map)
     OR om.org_id IN (SELECT canonical_organization_id FROM tmp_organization_merge_map)
)
SELECT
  target_org_id AS org_id,
  user_id,
  (array_agg(
    role
    ORDER BY
      CASE role
        WHEN 'owner' THEN 6
        WHEN 'admin' THEN 5
        WHEN 'manager' THEN 4
        WHEN 'editor' THEN 3
        WHEN 'host' THEN 2
        WHEN 'viewer' THEN 1
        ELSE 0
      END DESC,
      created_at ASC,
      source_org_id ASC
  ))[1] AS role,
  (array_agg(nullif(email, '') ORDER BY created_at ASC, source_org_id ASC)
    FILTER (WHERE nullif(email, '') IS NOT NULL))[1] AS email,
  (array_agg(nullif(first_name, '') ORDER BY created_at ASC, source_org_id ASC)
    FILTER (WHERE nullif(first_name, '') IS NOT NULL))[1] AS first_name,
  (array_agg(nullif(last_name, '') ORDER BY created_at ASC, source_org_id ASC)
    FILTER (WHERE nullif(last_name, '') IS NOT NULL))[1] AS last_name,
  min(created_at) AS created_at,
  max(updated_at) AS updated_at
FROM affected_members
GROUP BY target_org_id, user_id;

INSERT INTO public.org_members (
  org_id,
  user_id,
  role,
  email,
  first_name,
  last_name,
  created_at,
  updated_at
)
SELECT
  org_id,
  user_id,
  role,
  email,
  first_name,
  last_name,
  created_at,
  updated_at
FROM tmp_consolidated_org_members
ON CONFLICT (org_id, user_id) DO UPDATE
SET
  role = excluded.role,
  email = coalesce(nullif(public.org_members.email, ''), excluded.email),
  first_name = coalesce(nullif(public.org_members.first_name, ''), excluded.first_name),
  last_name = coalesce(nullif(public.org_members.last_name, ''), excluded.last_name),
  created_at = least(public.org_members.created_at, excluded.created_at),
  updated_at = greatest(public.org_members.updated_at, excluded.updated_at);

DELETE FROM public.org_members om
USING tmp_organization_merge_map m
WHERE om.org_id = m.duplicate_organization_id;

UPDATE public.venues v
SET
  org_id = m.canonical_organization_id,
  org_name = m.canonical_organization_name
FROM tmp_organization_merge_map m
WHERE v.org_id = m.duplicate_organization_id;

UPDATE public.venues v
SET org_name = o.name
FROM public.organizations o
WHERE v.org_id = o.id
  AND v.org_id IN (SELECT canonical_organization_id FROM tmp_organization_merge_map)
  AND v.org_name IS DISTINCT FROM o.name;

UPDATE public.org_invites oi
SET org_id = m.canonical_organization_id
FROM tmp_organization_merge_map m
WHERE oi.org_id = m.duplicate_organization_id;

UPDATE public.events e
SET org_id = m.canonical_organization_id
FROM tmp_organization_merge_map m
WHERE e.org_id = m.duplicate_organization_id;

UPDATE public.venue_members vm
SET org_id = m.canonical_organization_id
FROM tmp_organization_merge_map m
WHERE vm.org_id = m.duplicate_organization_id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'venue_subscriptions'
      AND column_name = 'org_id'
  ) THEN
    EXECUTE $sql$
      UPDATE public.venue_subscriptions vs
      SET org_id = m.canonical_organization_id
      FROM tmp_organization_merge_map m
      WHERE vs.org_id = m.duplicate_organization_id
    $sql$;
  END IF;
END $$;

-- Safety net: refuse to delete duplicate org rows if any table still has a
-- simple FK reference to organizations.id pointing at a duplicate id.
DO $$
DECLARE
  fk record;
  remaining_count bigint;
BEGIN
  FOR fk IN
    SELECT
      c.conrelid::regclass AS table_name,
      a.attname AS column_name
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid
     AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND c.confrelid = 'public.organizations'::regclass
      AND array_length(c.conkey, 1) = 1
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM %s child JOIN tmp_organization_merge_map m ON child.%I = m.duplicate_organization_id',
      fk.table_name,
      fk.column_name
    )
    INTO remaining_count;

    IF remaining_count > 0 THEN
      RAISE EXCEPTION
        'Refusing to delete duplicate organizations: %.% still has % duplicate org references',
        fk.table_name,
        fk.column_name,
        remaining_count;
    END IF;
  END LOOP;
END $$;

DELETE FROM public.organizations o
USING tmp_organization_merge_map m
WHERE o.id = m.duplicate_organization_id;

-- For merged brands, prefer the canonical org's deterministic name-derived
-- slug now that duplicate slugs have been released.
CREATE TEMP TABLE tmp_organization_canonical_slug_targets ON COMMIT DROP AS
WITH affected AS (
  SELECT DISTINCT canonical_organization_id AS id
  FROM tmp_organization_merge_map
),
target_candidates AS (
  SELECT
    o.id,
    o.slug,
    o.created_at,
    public.organization_slugify(o.name) AS base_slug,
    row_number() OVER (
      PARTITION BY public.organization_slugify(o.name)
      ORDER BY o.created_at ASC, o.id ASC
    ) AS target_rank
  FROM public.organizations o
  JOIN affected a ON a.id = o.id
),
available_slugs AS (
  SELECT
    tc.id,
    candidate.slug,
    row_number() OVER (PARTITION BY tc.id ORDER BY candidate.n ASC) AS available_rank
  FROM target_candidates tc
  CROSS JOIN LATERAL generate_series(1, 10000) AS candidate_rank(n)
  CROSS JOIN LATERAL (
    SELECT
      candidate_rank.n,
      CASE
        WHEN candidate_rank.n = 1 THEN tc.base_slug
        ELSE tc.base_slug || '-' || candidate_rank.n::text
      END AS slug
  ) candidate
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.organizations o
    WHERE o.id NOT IN (SELECT id FROM target_candidates)
      AND o.slug = candidate.slug
  )
)
SELECT tc.id, a.slug AS target_slug
FROM target_candidates tc
JOIN available_slugs a
  ON a.id = tc.id
 AND a.available_rank = tc.target_rank
WHERE tc.slug IS DISTINCT FROM a.slug;

UPDATE public.organizations o
SET slug = 'org-merge-' || replace(o.id::text, '-', '')
FROM tmp_organization_canonical_slug_targets t
WHERE o.id = t.id;

UPDATE public.organizations o
SET slug = t.target_slug
FROM tmp_organization_canonical_slug_targets t
WHERE o.id = t.id;

COMMIT;
