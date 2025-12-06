-- Phase 2.1: Add 40+ missing venues to known_venues table
-- Phase 3.1: Add recurring event columns

-- Add recurring event columns to instagram_posts
ALTER TABLE public.instagram_posts 
ADD COLUMN IF NOT EXISTS is_recurring boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS recurrence_pattern text;

COMMENT ON COLUMN public.instagram_posts.is_recurring IS 'True if event repeats (Every Friday, Weekly, etc.)';
COMMENT ON COLUMN public.instagram_posts.recurrence_pattern IS 'Pattern like weekly:friday, monthly:first-saturday, biweekly:saturday';

-- Add urgency score column for sorting
ALTER TABLE public.instagram_posts 
ADD COLUMN IF NOT EXISTS urgency_score integer DEFAULT 0;

COMMENT ON COLUMN public.instagram_posts.urgency_score IS 'Urgency score for sorting: Today +100, Tomorrow +80, This Week +50, etc.';

-- Add same columns to published_events for consistency
ALTER TABLE public.published_events 
ADD COLUMN IF NOT EXISTS is_recurring boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS recurrence_pattern text,
ADD COLUMN IF NOT EXISTS urgency_score integer DEFAULT 0;

-- Insert 40+ missing venues (Poblacion bars, clubs, art spaces, cafes)
INSERT INTO public.known_venues (name, aliases, address, city, lat, lng) VALUES
-- Poblacion Makati Bars & Clubs
('Ugly Duck', ARRAY['Ugly Duck Poblacion', 'Ugly Duck Bar'], 'General Luna St, Poblacion', 'Makati', 14.5649, 121.0295),
('Apotheka', ARRAY['Apotheka Bar', 'Apotheka Poblacion'], 'Makati Ave, Poblacion', 'Makati', 14.5651, 121.0297),
('BAR IX', ARRAY['Bar 9', 'Bar Nine', 'Bar IX Poblacion'], 'General Luna St, Poblacion', 'Makati', 14.5653, 121.0299),
('Whisky Park', ARRAY['Whiskey Park', 'Whisky Park Poblacion'], 'Felipe St, Poblacion', 'Makati', 14.5655, 121.0301),
('Limbo Bar & Lounge', ARRAY['Limbo', 'Limbo Bar', 'Limbo Poblacion'], 'Felipe St, Poblacion', 'Makati', 14.5539, 121.0489),
('Black Market', ARRAY['Black Market Poblacion', 'Black Market Makati'], 'Kalayaan Ave, Poblacion', 'Makati', 14.5641, 121.0277),
('Z Hostel Rooftop', ARRAY['Z Hostel', 'Z Rooftop'], 'Felipe St, Poblacion', 'Makati', 14.5643, 121.0279),
('Draft Gastropub', ARRAY['Draft', 'Draft Poblacion'], 'Polaris St, Poblacion', 'Makati', 14.5645, 121.0281),
('Single Origin', ARRAY['Single Origin Poblacion', 'Single Origin Coffee'], 'Makati Ave, Poblacion', 'Makati', 14.5647, 121.0283),
('Finders Keepers', ARRAY['Finders Keepers Poblacion'], 'Jupiter St, Poblacion', 'Makati', 14.5548, 121.0296),
('Tambai', ARRAY['Tambai Poblacion', 'Tambai Bar'], 'Felipe St, Poblacion', 'Makati', 14.5550, 121.0298),
('20:20', ARRAY['20:20 Bar', 'Twenty Twenty', '2020 Bar'], 'Polaris St, Poblacion', 'Makati', 14.5552, 121.0300),

-- Live Music Venues
('Route 196', ARRAY['Route196', 'Route 196 Katipunan'], 'Katipunan Avenue', 'Quezon City', 14.6369, 121.0789),
('SaGuijo', ARRAY['Saguijo Cafe', 'Saguijo Cafe + Bar'], '7612 Guijo Street', 'Makati', 14.5636, 121.0321),
('B-Side', ARRAY['Bside', 'B Side'], 'Makati Avenue', 'Makati', 14.5520, 121.0230),
('70s Bistro', ARRAY['70s Bistro Anonas', 'Seventies Bistro'], 'Anonas St', 'Quezon City', 14.6281, 121.0469),
('123 Block', ARRAY['123 Block Events', '123 Block Bar'], 'Pioneer Center', 'Mandaluyong', 14.5734, 121.0523),
('Balcony Music House', ARRAY['Balcony', 'Balcony Poblacion'], 'Makati Ave, Poblacion', 'Makati', 14.5533, 121.0485),
('19 East', ARRAY['19east', '19 East Bar'], 'Sucat Road', 'Paranaque', 14.4879, 121.0314),

-- Art Spaces & Galleries
('Gravity Art Space', ARRAY['Gravity Art', 'Gravity Gallery'], 'Taft Avenue', 'Manila', 14.5576, 120.9875),
('Spruce Gallery', ARRAY['Spruce', 'Spruce Art Gallery'], 'San Juan', 'San Juan', 14.6019, 121.0367),
('Cine Adarna', ARRAY['Cinema Adarna', 'UP Cine Adarna'], 'UP Diliman', 'Quezon City', 14.6545, 121.0668),
('Cinema 76', ARRAY['Cinema76', 'Cinema Seventysix'], 'San Juan', 'San Juan', 14.5994, 121.0338),
('Pineapple Lab', ARRAY['Pineapple Lab QC', 'Pineapple Lab Events'], 'Cubao', 'Quezon City', 14.6188, 121.0515),
('Vinyl on Vinyl', ARRAY['Vinyl on Vinyl Gallery', 'VOV'], 'Legazpi Village', 'Makati', 14.5532, 121.0185),
('Underground Gallery', ARRAY['Underground', 'The Underground'], 'BGC', 'Taguig', 14.5509, 121.0472),
('1335Mabini', ARRAY['1335 Mabini', '1335 Mabini Gallery'], 'Ermita', 'Manila', 14.5715, 120.9856),

-- Cafes & Event Spaces
('Heyday Cafe', ARRAY['Heyday', 'Heyday Poblacion'], 'General Luna St, Poblacion', 'Makati', 14.5637, 121.0309),
('Jess and Pats', ARRAY['Jess & Pats', 'Jess and Pats Cafe'], 'Poblacion', 'Makati', 14.5639, 121.0311),
('NoKal', ARRAY['Nokal MNL', 'NoKal Events'], 'Kalayaan Ave', 'Makati', 14.5641, 121.0313),
('Yardstick Coffee', ARRAY['Yardstick', 'Yardstick Makati'], 'Makati CBD', 'Makati', 14.5583, 121.0187),
('The Alley at Karrivin', ARRAY['The Alley', 'Karrivin', 'Alley at Karrivin'], 'Chino Roces Extension', 'Makati', 14.5485, 121.0336),
('Commune Cafe', ARRAY['Commune', 'Commune Poblacion'], 'Poblacion', 'Makati', 14.5643, 121.0315),
('Early Night', ARRAY['Early Night Bar', 'Early Night Poblacion'], 'Poblacion', 'Makati', 14.5645, 121.0317),

-- BGC Venues
('Social House BGC', ARRAY['Social House', 'Social House Manila'], 'BGC', 'Taguig', 14.5533, 121.0483),
('The Palace Pool Club', ARRAY['Palace Pool Club', 'Palace Pool', 'The Palace'], 'BGC', 'Taguig', 14.5535, 121.0485),
('Valkyrie', ARRAY['Valkyrie BGC', 'Valkyrie Nightclub'], 'BGC', 'Taguig', 14.5537, 121.0487),
('Revel at The Palace', ARRAY['Revel', 'Revel BGC'], 'BGC', 'Taguig', 14.5539, 121.0489),
('Pool Club', ARRAY['Pool Club BGC'], 'BGC', 'Taguig', 14.5541, 121.0491),
('Bunk BGC', ARRAY['Bunk', 'Bunk Bar'], 'BGC', 'Taguig', 14.5543, 121.0493),

-- Hotels & Large Venues
('Okada Manila', ARRAY['Okada', 'Okada Hotel'], 'Entertainment City', 'Paranaque', 14.5253, 120.9792),
('Solaire Resort', ARRAY['Solaire', 'Solaire Casino'], 'Entertainment City', 'Paranaque', 14.5258, 120.9780),
('City of Dreams', ARRAY['City of Dreams Manila', 'COD Manila'], 'Entertainment City', 'Paranaque', 14.5260, 120.9795),
('The Theatre at Solaire', ARRAY['Theatre at Solaire', 'Solaire Theatre'], 'Entertainment City', 'Paranaque', 14.5258, 120.9785),
('Samsung Hall', ARRAY['Samsung Hall SM Aura'], 'SM Aura', 'Taguig', 14.5497, 121.0551),
('New Frontier Theater', ARRAY['Frontier Theater', 'New Frontier'], 'Cubao', 'Quezon City', 14.6202, 121.0531),
('Philippine Arena', ARRAY['Arena', 'PH Arena'], 'Bulacan', 'Bocaue', 14.8282, 120.9989),
('Mall of Asia Arena', ARRAY['MOA Arena', 'SM MOA Arena'], 'Pasay', 'Pasay', 14.5359, 120.9826),

-- Other Popular Venues
('Vector Billiards', ARRAY['Vector', 'Vector Pool Hall'], 'Ortigas', 'Pasig', 14.5867, 121.0572),
('The Fifth at Rockwell', ARRAY['The Fifth', 'Fifth Rockwell'], 'Rockwell', 'Makati', 14.5636, 121.0359),
('3 Torre Lorenzo', ARRAY['3 Torre', 'Torre Lorenzo'], 'Taft Avenue', 'Manila', 14.5574, 120.9878),
('Centris Elements', ARRAY['Elements Centris', 'Centris Walk'], 'EDSA', 'Quezon City', 14.6425, 121.0493),
('Forbestown', ARRAY['Forbestown BGC', 'Forbestown Center'], 'BGC', 'Taguig', 14.5528, 121.0465),
('XYLO at The Palace', ARRAY['XYLO', 'Xylo BGC'], 'BGC', 'Taguig', 14.5545, 121.0495)
ON CONFLICT (name) DO NOTHING;

-- Create index for faster urgency sorting
CREATE INDEX IF NOT EXISTS idx_instagram_posts_urgency ON public.instagram_posts (urgency_score DESC, event_date ASC) WHERE is_event = true;