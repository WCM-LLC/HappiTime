-- Verify the organization dedupe migration after it has been applied.
-- Safe for production checks: the duplicate-insert smoke test is rolled back.

BEGIN;

DO $$
DECLARE
  violation_count bigint;
  test_slug text := 'org-duplicate-guard-' || replace(gen_random_uuid()::text, '-', '');
BEGIN
  SELECT count(*)
  INTO violation_count
  FROM (
    SELECT public.normalize_organization_name(name) AS normalized_name
    FROM public.organizations
    GROUP BY public.normalize_organization_name(name)
    HAVING count(*) > 1
  ) duplicates;

  IF violation_count > 0 THEN
    RAISE EXCEPTION 'Found % duplicate organization normalized-name groups', violation_count;
  END IF;

  SELECT count(*)
  INTO violation_count
  FROM (
    SELECT slug
    FROM public.organizations
    WHERE slug IS NOT NULL
    GROUP BY slug
    HAVING count(*) > 1
  ) duplicate_slugs;

  IF violation_count > 0 THEN
    RAISE EXCEPTION 'Found % duplicate organization slugs', violation_count;
  END IF;

  SELECT count(*)
  INTO violation_count
  FROM public.venues v
  LEFT JOIN public.organizations o ON o.id = v.org_id
  WHERE o.id IS NULL;

  IF violation_count > 0 THEN
    RAISE EXCEPTION 'Found % venues with invalid org_id values', violation_count;
  END IF;

  SELECT count(*)
  INTO violation_count
  FROM public.venues v
  JOIN public.organizations o ON o.id = v.org_id
  WHERE v.org_name IS DISTINCT FROM o.name;

  IF violation_count > 0 THEN
    RAISE EXCEPTION 'Found % venues with org_name out of sync with organizations.name', violation_count;
  END IF;

  SELECT count(*)
  INTO violation_count
  FROM (
    SELECT org_id, user_id
    FROM public.org_members
    GROUP BY org_id, user_id
    HAVING count(*) > 1
  ) duplicate_members;

  IF violation_count > 0 THEN
    RAISE EXCEPTION 'Found % duplicate org_members rows after consolidation', violation_count;
  END IF;

  IF to_regclass('public.organization_merge_audit') IS NOT NULL THEN
    SELECT count(*)
    INTO violation_count
    FROM public.organization_merge_audit a
    JOIN public.org_members om
      ON om.org_id = a.duplicate_organization_id;

    IF violation_count > 0 THEN
      RAISE EXCEPTION 'Found % org_members rows still pointing at merged duplicate orgs', violation_count;
    END IF;
  END IF;

  INSERT INTO public.organizations (name, slug)
  VALUES ('Duplicate Guard Smoke', test_slug);

  BEGIN
    INSERT INTO public.organizations (name, slug)
    VALUES ('Duplicate Guard Smoke Copy', test_slug);

    RAISE EXCEPTION 'Duplicate organization slug insert unexpectedly succeeded';
  EXCEPTION
    WHEN unique_violation THEN
      NULL;
  END;
END $$;

ROLLBACK;
