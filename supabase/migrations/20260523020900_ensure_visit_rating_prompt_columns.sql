-- Guard against production schema drift where the migration history contains
-- the visit-rating migration but these columns are absent from venue_visits.
ALTER TABLE public.venue_visits
  ADD COLUMN IF NOT EXISTS rating_prompted_at timestamptz,
  ADD COLUMN IF NOT EXISTS rating_prompt_source text;
