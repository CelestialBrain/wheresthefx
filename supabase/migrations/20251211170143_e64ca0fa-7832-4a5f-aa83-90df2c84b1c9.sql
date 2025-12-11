-- Add venue variant aliases for commonly missed spellings
-- This improves matching for venues that have different spellings/formats

-- HUB Make Lab variants
UPDATE public.known_venues 
SET aliases = array_append(COALESCE(aliases, '{}'), 'HUB | Make Lab')
WHERE name = 'HUB Make Lab' AND NOT ('HUB | Make Lab' = ANY(COALESCE(aliases, '{}')));

UPDATE public.known_venues 
SET aliases = array_append(COALESCE(aliases, '{}'), 'HUB|Make Lab')
WHERE name = 'HUB Make Lab' AND NOT ('HUB|Make Lab' = ANY(COALESCE(aliases, '{}')));

-- Smart Araneta Coliseum variants
UPDATE public.known_venues 
SET aliases = array_append(COALESCE(aliases, '{}'), 'SmartAranetaColiseum')
WHERE name = 'Smart Araneta Coliseum' AND NOT ('SmartAranetaColiseum' = ANY(COALESCE(aliases, '{}')));

UPDATE public.known_venues 
SET aliases = array_append(COALESCE(aliases, '{}'), 'Araneta Coliseum')
WHERE name = 'Smart Araneta Coliseum' AND NOT ('Araneta Coliseum' = ANY(COALESCE(aliases, '{}')));

-- White Rabbit Building variants
UPDATE public.known_venues 
SET aliases = array_append(COALESCE(aliases, '{}'), 'White Rabbit Bldg')
WHERE name = 'White Rabbit Building' AND NOT ('White Rabbit Bldg' = ANY(COALESCE(aliases, '{}')));

UPDATE public.known_venues 
SET aliases = array_append(COALESCE(aliases, '{}'), 'WhiteRabbit')
WHERE name = 'White Rabbit Building' AND NOT ('WhiteRabbit' = ANY(COALESCE(aliases, '{}')));

-- Proscenium Theater variants  
UPDATE public.known_venues
SET aliases = array_append(COALESCE(aliases, '{}'), 'The Proscenium')
WHERE name = 'Proscenium Theater' AND NOT ('The Proscenium' = ANY(COALESCE(aliases, '{}')));

-- Cinema '76 apostrophe variants
UPDATE public.known_venues 
SET aliases = array_append(COALESCE(aliases, '{}'), 'Cinema ''76')
WHERE name ILIKE 'Cinema%76%' AND NOT ('Cinema ''76' = ANY(COALESCE(aliases, '{}')));

UPDATE public.known_venues 
SET aliases = array_append(COALESCE(aliases, '{}'), 'Cinema76')
WHERE name ILIKE 'Cinema%76%' AND NOT ('Cinema76' = ANY(COALESCE(aliases, '{}')));

-- Saguijo variants
UPDATE public.known_venues 
SET aliases = array_append(COALESCE(aliases, '{}'), 'SaGuijo')
WHERE name ILIKE '%saGuijo%' AND NOT ('SaGuijo' = ANY(COALESCE(aliases, '{}')));

UPDATE public.known_venues 
SET aliases = array_append(COALESCE(aliases, '{}'), 'Sa Guijo')
WHERE name ILIKE '%saGuijo%' AND NOT ('Sa Guijo' = ANY(COALESCE(aliases, '{}')));

-- 70s Bistro variants
UPDATE public.known_venues 
SET aliases = array_append(COALESCE(aliases, '{}'), '70''s Bistro')
WHERE name ILIKE '%70%Bistro%' AND NOT ('70''s Bistro' = ANY(COALESCE(aliases, '{}')));

-- Lost and Found variants
UPDATE public.known_venues 
SET aliases = array_append(COALESCE(aliases, '{}'), 'lostandfoundatmakati')
WHERE name ILIKE '%Lost and Found%Makati%' AND NOT ('lostandfoundatmakati' = ANY(COALESCE(aliases, '{}')));

UPDATE public.known_venues 
SET aliases = array_append(COALESCE(aliases, '{}'), 'Lost & Found Makati')
WHERE name ILIKE '%Lost and Found%Makati%' AND NOT ('Lost & Found Makati' = ANY(COALESCE(aliases, '{}')));

-- Add new commonly mentioned venues that might be missing
INSERT INTO public.known_venues (name, aliases, city, lat, lng)
SELECT 'Areté', ARRAY['Arete', 'Arete Ateneo', 'Areté Ateneo'], 'Quezon City', 14.6407, 121.0775
WHERE NOT EXISTS (SELECT 1 FROM public.known_venues WHERE name ILIKE '%Areté%' OR name ILIKE '%Arete%');

INSERT INTO public.known_venues (name, aliases, city, lat, lng)  
SELECT 'Conspiracy Garden Cafe', ARRAY['Conspiracy Cafe', 'Conspiracy QC'], 'Quezon City', 14.6341, 121.0400
WHERE NOT EXISTS (SELECT 1 FROM public.known_venues WHERE name ILIKE '%Conspiracy%');

INSERT INTO public.known_venues (name, aliases, city, lat, lng)
SELECT 'Route 196', ARRAY['Route196', 'Route 196 Bar'], 'Quezon City', 14.6187, 121.0574
WHERE NOT EXISTS (SELECT 1 FROM public.known_venues WHERE name ILIKE '%Route 196%');

INSERT INTO public.known_venues (name, aliases, city, lat, lng)
SELECT 'B-Side', ARRAY['BSide', 'B Side', 'B-Side The Collective'], 'Makati', 14.5631, 121.0305
WHERE NOT EXISTS (SELECT 1 FROM public.known_venues WHERE name ILIKE '%B-Side%' AND name NOT ILIKE '%hotel%');

INSERT INTO public.known_venues (name, aliases, city, lat, lng)
SELECT 'The Collective', ARRAY['Collective Makati', 'The Collective Makati'], 'Makati', 14.5631, 121.0305
WHERE NOT EXISTS (SELECT 1 FROM public.known_venues WHERE name ILIKE '%The Collective%' AND city ILIKE '%Makati%');