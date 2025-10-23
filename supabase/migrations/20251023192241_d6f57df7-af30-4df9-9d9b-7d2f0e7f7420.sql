-- Create locations table for normalized venue data
CREATE TABLE IF NOT EXISTS public.locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Core location data
  location_name TEXT NOT NULL,
  location_lat NUMERIC,
  location_lng NUMERIC,
  place_id TEXT UNIQUE,
  formatted_address TEXT,
  floor_note TEXT,
  
  -- Metadata
  needs_review BOOLEAN NOT NULL DEFAULT false,
  verified BOOLEAN NOT NULL DEFAULT false,
  total_events INTEGER NOT NULL DEFAULT 0
);

-- Create indexes for locations
CREATE INDEX idx_locations_place_id ON public.locations(place_id);
CREATE INDEX idx_locations_coords ON public.locations(location_lat, location_lng);
CREATE INDEX idx_locations_name ON public.locations USING gin(to_tsvector('english', location_name));
CREATE INDEX idx_locations_needs_review ON public.locations(needs_review) WHERE needs_review = true;

-- Enable RLS on locations
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

-- Locations are viewable by everyone
CREATE POLICY "Locations are viewable by everyone"
ON public.locations
FOR SELECT
USING (true);

-- Admins can manage locations
CREATE POLICY "Admins can manage locations"
ON public.locations
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create events table for enriched event data
CREATE TABLE IF NOT EXISTS public.events_enriched (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Source
  instagram_post_id UUID REFERENCES public.instagram_posts(id) ON DELETE CASCADE,
  
  -- Event details
  event_title TEXT NOT NULL,
  event_date DATE NOT NULL,
  event_time TIME,
  end_time TIME,
  description TEXT,
  
  -- Location (foreign key)
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  
  -- Pricing
  is_free BOOLEAN NOT NULL DEFAULT true,
  price NUMERIC,
  signup_url TEXT,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'cancelled')),
  needs_review BOOLEAN NOT NULL DEFAULT false,
  verified BOOLEAN NOT NULL DEFAULT false,
  
  -- Denormalized engagement (from post)
  likes_count INTEGER NOT NULL DEFAULT 0,
  comments_count INTEGER NOT NULL DEFAULT 0
);

-- Create indexes for events_enriched
CREATE INDEX idx_events_enriched_date ON public.events_enriched(event_date);
CREATE INDEX idx_events_enriched_location ON public.events_enriched(location_id);
CREATE INDEX idx_events_enriched_post ON public.events_enriched(instagram_post_id);
CREATE INDEX idx_events_enriched_status ON public.events_enriched(status, needs_review);
CREATE INDEX idx_events_enriched_needs_review ON public.events_enriched(needs_review) WHERE needs_review = true;

-- Enable RLS on events_enriched
ALTER TABLE public.events_enriched ENABLE ROW LEVEL SECURITY;

-- Published events are viewable by everyone
CREATE POLICY "Published events are viewable by everyone"
ON public.events_enriched
FOR SELECT
USING (status = 'published' OR has_role(auth.uid(), 'admin'::app_role));

-- Admins can manage events
CREATE POLICY "Admins can manage events"
ON public.events_enriched
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for updated_at on locations
CREATE TRIGGER update_locations_updated_at
BEFORE UPDATE ON public.locations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create trigger for updated_at on events_enriched
CREATE TRIGGER update_events_enriched_updated_at
BEFORE UPDATE ON public.events_enriched
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();