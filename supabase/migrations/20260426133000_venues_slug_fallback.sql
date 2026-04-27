-- Fallback slug generation for venues.
-- Keeps NOT NULL + UNIQUE integrity while preventing null/empty slug writes
-- when a safe slug can be derived from venue name.

create or replace function public.venue_slugify(input text)
returns text
language sql
immutable
as $$
  select nullif(
    trim(both '-' from regexp_replace(lower(coalesce(input, '')), '[^a-z0-9]+', '-', 'g')),
    ''
  );
$$;

create or replace function public.venues_ensure_slug()
returns trigger
language plpgsql
as $$
declare
  base_slug text;
  candidate_slug text;
  suffix int := 2;
begin
  -- Preserve valid slugs; only intervene for null/empty inputs.
  if nullif(btrim(new.slug), '') is null then
    if tg_op = 'UPDATE' and nullif(btrim(old.slug), '') is not null then
      -- Minimal-risk fallback: keep existing slug on updates if already valid.
      new.slug := old.slug;
      return new;
    end if;

    base_slug := public.venue_slugify(new.name);

    -- If no safe slug can be derived, allow NOT NULL constraint to surface.
    if base_slug is null then
      return new;
    end if;

    candidate_slug := base_slug;

    -- Only collision-handle auto-derived slugs.
    -- Serialize auto-generation per base slug to reduce concurrent race conflicts.
    perform pg_advisory_xact_lock(hashtextextended(base_slug, 0));

    while exists (
      select 1
      from public.venues v
      where v.slug = candidate_slug
        and v.id is distinct from new.id
    ) loop
      candidate_slug := base_slug || '-' || suffix::text;
      suffix := suffix + 1;
    end loop;

    new.slug := candidate_slug;
  end if;

  return new;
end;
$$;

drop trigger if exists venues_ensure_slug on public.venues;
create trigger venues_ensure_slug
before insert or update of slug, name on public.venues
for each row
execute function public.venues_ensure_slug();

-- Backfill any legacy empty/null slugs without touching valid existing values.
-- Guard with venue_slugify(name) so migration doesn't fail on un-sluggable names.
do $$
declare
  r record;
begin
  for r in
    select v.id
    from public.venues v
    where nullif(btrim(v.slug), '') is null
      and public.venue_slugify(v.name) is not null
    order by v.created_at, v.id
  loop
    -- Set to NULL so trigger applies the same fallback logic as runtime writes.
    update public.venues
    set slug = null
    where id = r.id;
  end loop;
end
$$;
