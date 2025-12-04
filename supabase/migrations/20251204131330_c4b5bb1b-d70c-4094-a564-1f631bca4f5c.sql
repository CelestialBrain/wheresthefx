-- Add AI extraction columns to instagram_posts
ALTER TABLE public.instagram_posts 
ADD COLUMN IF NOT EXISTS ai_extraction jsonb,
ADD COLUMN IF NOT EXISTS extraction_method text DEFAULT 'regex',
ADD COLUMN IF NOT EXISTS ai_confidence numeric,
ADD COLUMN IF NOT EXISTS ai_reasoning text;

-- Add index for extraction_method filtering
CREATE INDEX IF NOT EXISTS idx_instagram_posts_extraction_method ON public.instagram_posts(extraction_method);

-- Create known_venues table for smart context
CREATE TABLE IF NOT EXISTS public.known_venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  aliases text[] DEFAULT '{}',
  address text,
  city text,
  lat numeric,
  lng numeric,
  instagram_handle text,
  learned_from_corrections boolean DEFAULT false,
  correction_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create unique index on name to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_known_venues_name ON public.known_venues(name);

-- Create index for alias search
CREATE INDEX IF NOT EXISTS idx_known_venues_aliases ON public.known_venues USING GIN(aliases);

-- Enable RLS on known_venues
ALTER TABLE public.known_venues ENABLE ROW LEVEL SECURITY;

-- RLS: Everyone can read known venues
CREATE POLICY "Known venues are viewable by everyone" ON public.known_venues
  FOR SELECT USING (true);

-- RLS: Admins can manage known venues
CREATE POLICY "Admins can manage known venues" ON public.known_venues
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Create account_venue_stats table
CREATE TABLE IF NOT EXISTS public.account_venue_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instagram_account_id uuid REFERENCES public.instagram_accounts(id) ON DELETE CASCADE,
  venue_name text NOT NULL,
  post_count integer DEFAULT 1,
  last_used_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(instagram_account_id, venue_name)
);

-- Enable RLS on account_venue_stats
ALTER TABLE public.account_venue_stats ENABLE ROW LEVEL SECURITY;

-- RLS: Everyone can read account venue stats
CREATE POLICY "Account venue stats are viewable by everyone" ON public.account_venue_stats
  FOR SELECT USING (true);

-- RLS: Service role can manage stats
CREATE POLICY "Service role can manage account venue stats" ON public.account_venue_stats
  FOR ALL USING (true);

-- Create function to update account venue stats
CREATE OR REPLACE FUNCTION public.update_account_venue_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process if location_name is set and is_event is true
  IF NEW.location_name IS NOT NULL AND NEW.is_event = true THEN
    INSERT INTO public.account_venue_stats (instagram_account_id, venue_name, post_count, last_used_at)
    VALUES (NEW.instagram_account_id, NEW.location_name, 1, NOW())
    ON CONFLICT (instagram_account_id, venue_name)
    DO UPDATE SET 
      post_count = account_venue_stats.post_count + 1,
      last_used_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for auto-updating account venue stats
DROP TRIGGER IF EXISTS trg_update_account_venue_stats ON public.instagram_posts;
CREATE TRIGGER trg_update_account_venue_stats
  AFTER INSERT ON public.instagram_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_account_venue_stats();

-- Seed known_venues with NCR venues
INSERT INTO public.known_venues (name, aliases, address, city, lat, lng) VALUES
  ('SM City North EDSA', ARRAY['SM North EDSA', 'SM North'], 'North Avenue corner EDSA', 'Quezon City', 14.6565, 121.0296),
  ('Trinoma Mall', ARRAY['Trinoma'], 'North Avenue corner EDSA', 'Quezon City', 14.6561, 121.0327),
  ('Eastwood City', ARRAY['Eastwood'], 'Libis', 'Quezon City', 14.6094, 121.0775),
  ('UP Town Center', ARRAY['UPTC', 'UP TC'], 'Katipunan Avenue', 'Quezon City', 14.6527, 121.0693),
  ('Cubao Expo', ARRAY['Cubao X', 'CubaoX'], 'General Romulo Avenue', 'Quezon City', 14.6193, 121.0519),
  ('Araneta City', ARRAY['Araneta Center'], 'Cubao', 'Quezon City', 14.6206, 121.0525),
  ('Smart Araneta Coliseum', ARRAY['Araneta Coliseum', 'Big Dome'], 'Araneta City, Cubao', 'Quezon City', 14.6209, 121.0517),
  ('Bonifacio High Street', ARRAY['BGC High Street', 'High Street'], '5th Avenue', 'Taguig', 14.5505, 121.0515),
  ('Uptown Bonifacio', ARRAY['Uptown Mall', 'Uptown BGC'], '36th Street corner 9th Avenue', 'Taguig', 14.5657, 121.0534),
  ('Bonifacio Global City', ARRAY['BGC', 'The Fort'], NULL, 'Taguig', 14.5507, 121.0470),
  ('Market! Market!', ARRAY['Market Market'], 'McKinley Parkway', 'Taguig', 14.5491, 121.0553),
  ('Greenbelt', ARRAY['Greenbelt 1', 'Greenbelt 2', 'Greenbelt 3', 'Greenbelt 4', 'Greenbelt 5'], 'Makati Avenue', 'Makati', 14.5531, 121.0223),
  ('Glorietta', ARRAY['Glorietta 1', 'Glorietta 2', 'Glorietta 3', 'Glorietta 4', 'Glorietta 5'], 'Ayala Center', 'Makati', 14.5502, 121.0249),
  ('Poblacion Makati', ARRAY['Poblacion', 'Pob'], NULL, 'Makati', 14.5587, 121.0239),
  ('Power Plant Mall', ARRAY['Powerplant'], 'Rockwell Center', 'Makati', 14.5634, 121.0357),
  ('SM Megamall', ARRAY['Megamall'], 'EDSA corner Julia Vargas Avenue', 'Pasig', 14.5850, 121.0564),
  ('Capitol Commons', ARRAY['Cap Comm'], 'Meralco Avenue', 'Pasig', 14.5826, 121.0603),
  ('SM Mall of Asia', ARRAY['MOA', 'Mall of Asia', 'SM MOA'], 'Manila Bay Reclamation Area', 'Pasay', 14.5352, 120.9818),
  ('Intramuros', ARRAY['Walled City'], NULL, 'Manila', 14.5906, 120.9753),
  ('Rizal Park', ARRAY['Luneta', 'Luneta Park'], 'Padre Burgos Avenue', 'Manila', 14.5831, 120.9794),
  ('Alabang Town Center', ARRAY['ATC'], 'Commerce Avenue', 'Muntinlupa', 14.4208, 121.0419),
  ('Festival Supermall', ARRAY['Festival Mall', 'Festival'], 'Filinvest Corporate City', 'Muntinlupa', 14.4189, 121.0476),
  ('Radius Katipunan', ARRAY['Radius', '@radius_katipunan'], '318 Katipunan Avenue', 'Quezon City', 14.6382, 121.0791),
  ('Mows Bar', ARRAY['mowsbar', '@mowsbar'], NULL, 'Makati', 14.5587, 121.0239),
  ('The Victor', ARRAY['Victor Art Installation', 'The Victor Art Installation'], 'Bridgetowne', 'Pasig', 14.5750, 121.0650),
  ('19 East', ARRAY['19east'], 'Sucat Road', 'Paranaque', 14.4879, 121.0314),
  ('Route 196', ARRAY['Route196', '@route196rocks'], 'Katipunan Avenue', 'Quezon City', 14.6369, 121.0789),
  ('SaGuijo', ARRAY['Saguijo Cafe', '@saguijo'], '7612 Guijo Street', 'Makati', 14.5636, 121.0321),
  ('B-Side', ARRAY['Bside', '@bsideph'], 'Makati Avenue', 'Makati', 14.5520, 121.0230)
ON CONFLICT (name) DO NOTHING;