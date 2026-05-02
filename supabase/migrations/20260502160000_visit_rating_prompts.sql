-- Venue-configurable post-visit rating prompts + normalized aspect selections

ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS post_visit_rating_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS post_visit_rating_aspects text[] NOT NULL DEFAULT ARRAY[]::text[];

ALTER TABLE public.venue_visits
  ADD COLUMN IF NOT EXISTS rating_prompted_at timestamptz,
  ADD COLUMN IF NOT EXISTS rating_prompt_source text;

CREATE TABLE IF NOT EXISTS public.visit_rating_aspects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid NOT NULL REFERENCES public.venue_visits(id) ON DELETE CASCADE,
  aspect_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(visit_id, aspect_key)
);

ALTER TABLE public.visit_rating_aspects ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'visit_rating_aspects'
      AND policyname = 'Users can view own visit rating aspects'
  ) THEN
    CREATE POLICY "Users can view own visit rating aspects"
      ON public.visit_rating_aspects
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1
          FROM public.venue_visits vv
          WHERE vv.id = visit_id
            AND vv.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'visit_rating_aspects'
      AND policyname = 'Users can insert own visit rating aspects'
  ) THEN
    CREATE POLICY "Users can insert own visit rating aspects"
      ON public.visit_rating_aspects
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.venue_visits vv
          WHERE vv.id = visit_id
            AND vv.user_id = auth.uid()
        )
      );
  END IF;
END $$;
