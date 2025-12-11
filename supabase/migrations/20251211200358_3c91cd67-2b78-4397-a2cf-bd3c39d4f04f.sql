-- Add 'outside_service_area' to the location_status constraint
ALTER TABLE public.instagram_posts DROP CONSTRAINT IF EXISTS instagram_posts_location_status_check;

ALTER TABLE public.instagram_posts ADD CONSTRAINT instagram_posts_location_status_check 
  CHECK (location_status IS NULL OR location_status = ANY (ARRAY['confirmed', 'tba', 'secret', 'dm_for_details', 'outside_service_area']));