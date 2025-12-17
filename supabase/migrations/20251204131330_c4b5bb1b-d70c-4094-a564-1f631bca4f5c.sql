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
DO $$ BEGIN
  CREATE POLICY "Known venues are viewable by everyone" ON public.known_venues
    FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'policy "Known venues are viewable by everyone" already exists, skipping';
END $$;

-- RLS: Admins can manage known venues
DO $$ BEGIN
  CREATE POLICY "Admins can manage known venues" ON public.known_venues
    FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'policy "Admins can manage known venues" already exists, skipping';
END $$;

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
-- NOTE: Venues are now seeded via scripts/seed-known-venues.js and scripts/seed-additional-venues.js
-- This INSERT is commented out to avoid ON CONFLICT issues since UNIQUE INDEX was added later
-- Keeping this here for reference only
-- INSERT INTO public.known_venues (name, aliases, address, city, lat, lng) VALUES ...
-- ON CONFLICT (name) DO NOTHING;