-- Transfer media from "Rye Plaza" venue (Rye Plaza org) to "Plaza" venue (Rye org).
--
-- "Plaza" (30b972f6) has 6 broken Cloudinary images that don't render in the app.
-- "Rye Plaza" (7bc65557) has 6 working venue-media images from Google Places.
-- We archive the broken images and reassign the working ones.

-- Step 1: Archive the non-rendering Cloudinary media on the target venue.
UPDATE public.venue_media
SET    status = 'archived',
       updated_at = now()
WHERE  venue_id = '30b972f6-a2fe-4de4-80d0-e128cc7b9c07'
  AND  storage_bucket = 'cloudinary';

-- Step 2: Reassign the working venue-media rows to the target venue.
-- sort_order (0–5) carries over unchanged; they become the primary images.
UPDATE public.venue_media
SET    venue_id   = '30b972f6-a2fe-4de4-80d0-e128cc7b9c07',
       updated_at = now()
WHERE  venue_id = '7bc65557-a4bc-42cd-82c7-344f98fb2649';
