-- Flag set by validate-venue-places when a venue's stored address drifts from
-- Google's canonical Places record. Surfaced in admin review later.
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS needs_address_review boolean NOT NULL DEFAULT false;
