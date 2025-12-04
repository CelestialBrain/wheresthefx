-- Smart Context System tables for AI extraction enhancement
-- This migration adds tables to support intelligent context building for AI extraction

-- ============================================================
-- Known Venues table (learned from corrections + manual entry)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.known_venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,                    -- "Radius Katipunan"
  aliases text[] DEFAULT '{}',           -- ["Radius", "@radius_katipunan"]
  address text,                          -- "318 Katipunan Avenue"
  city text,                             -- "Quezon City"
  lat numeric,
  lng numeric,
  instagram_handle text,                 -- "@radius_katipunan"
  learned_from_corrections boolean DEFAULT false,
  correction_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes for known_venues
CREATE INDEX IF NOT EXISTS idx_known_venues_name ON public.known_venues(name);
CREATE INDEX IF NOT EXISTS idx_known_venues_city ON public.known_venues(city);
CREATE INDEX IF NOT EXISTS idx_known_venues_aliases ON public.known_venues USING gin(aliases);

-- Enable RLS on known_venues
ALTER TABLE public.known_venues ENABLE ROW LEVEL SECURITY;

-- RLS Policies for known_venues
CREATE POLICY "Known venues viewable by authenticated users"
  ON public.known_venues
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage known venues"
  ON public.known_venues
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- ============================================================
-- Account Venue Stats table (auto-populated from posts)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.account_venue_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instagram_account_id uuid REFERENCES public.instagram_accounts(id) ON DELETE CASCADE,
  venue_name text NOT NULL,
  post_count integer DEFAULT 1,
  last_used_at timestamptz DEFAULT now(),
  UNIQUE(instagram_account_id, venue_name)
);

-- Create indexes for account_venue_stats
CREATE INDEX IF NOT EXISTS idx_account_venue_stats_account ON public.account_venue_stats(instagram_account_id);
CREATE INDEX IF NOT EXISTS idx_account_venue_stats_venue ON public.account_venue_stats(venue_name);
CREATE INDEX IF NOT EXISTS idx_account_venue_stats_count ON public.account_venue_stats(post_count DESC);

-- Enable RLS on account_venue_stats
ALTER TABLE public.account_venue_stats ENABLE ROW LEVEL SECURITY;

-- RLS Policies for account_venue_stats
CREATE POLICY "Account venue stats viewable by authenticated users"
  ON public.account_venue_stats
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage account venue stats"
  ON public.account_venue_stats
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- ============================================================
-- Trigger to auto-update account_venue_stats on post insert
-- Only triggers for event posts with a location to improve performance
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_account_venue_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update stats for event posts with a location name
  IF NEW.is_event = true AND NEW.location_name IS NOT NULL THEN
    INSERT INTO public.account_venue_stats (instagram_account_id, venue_name, post_count, last_used_at)
    VALUES (NEW.instagram_account_id, NEW.location_name, 1, NOW())
    ON CONFLICT (instagram_account_id, venue_name)
    DO UPDATE SET 
      post_count = account_venue_stats.post_count + 1,
      last_used_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_account_venue_stats
AFTER INSERT ON public.instagram_posts
FOR EACH ROW EXECUTE FUNCTION public.update_account_venue_stats();

-- ============================================================
-- Add trigram extension and index for similarity search
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Add trigram index for similarity search on extraction_corrections
CREATE INDEX IF NOT EXISTS idx_corrections_original_trgm 
ON public.extraction_corrections 
USING gin (original_extracted_value gin_trgm_ops);

-- Add trigram index for known_venues name search
CREATE INDEX IF NOT EXISTS idx_known_venues_name_trgm 
ON public.known_venues 
USING gin (name gin_trgm_ops);

-- ============================================================
-- Updated_at trigger for known_venues
-- ============================================================
CREATE TRIGGER update_known_venues_updated_at
BEFORE UPDATE ON public.known_venues
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
