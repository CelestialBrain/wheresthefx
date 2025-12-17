-- Add SaGuijo aliases for better matching
UPDATE public.known_venues 
SET aliases = array_cat(
  COALESCE(aliases, ARRAY[]::text[]),
  ARRAY['saguijobar', 'saGuijo Cafe + Bar Events', 'SaGuijo Events', 'Sa Guijo']
)
WHERE name ILIKE '%saguijo%' OR name ILIKE '%sa guijo%';

-- Also ensure SaGuijo exists with proper data (commented out - seeded via script)
-- INSERT INTO public.known_venues (name, aliases, address, city, lat, lng)
-- VALUES (
--   'SaGuijo Café + Bar',
--   ARRAY['saguijobar', 'saGuijo Cafe + Bar Events', 'SaGuijo Events', 'Sa Guijo', 'SaGuijo Bar', 'SaGuijo Cafe'],
--   '7612 Guijo St., San Antonio Village',
--   'Makati',
--   14.5650,
--   121.0220
-- )
-- ON CONFLICT (name) DO UPDATE SET
--   aliases = ARRAY['saguijobar', 'saGuijo Cafe + Bar Events', 'SaGuijo Events', 'Sa Guijo', 'SaGuijo Bar', 'SaGuijo Cafe'],
--   address = COALESCE(EXCLUDED.address, known_venues.address),
--   lat = COALESCE(EXCLUDED.lat, known_venues.lat),
--   lng = COALESCE(EXCLUDED.lng, known_venues.lng);