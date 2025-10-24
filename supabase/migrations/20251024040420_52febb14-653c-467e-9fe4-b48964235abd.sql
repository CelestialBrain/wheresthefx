-- Create published_events table as the final canonical feed
CREATE TABLE IF NOT EXISTS public.published_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Core event info
  event_title TEXT NOT NULL,
  event_date DATE NOT NULL,
  event_time TIME,
  end_time TIME,
  description TEXT,
  signup_url TEXT,
  
  -- Pricing
  is_free BOOLEAN NOT NULL DEFAULT true,
  price NUMERIC(10, 2),
  
  -- Location (canonical coordinates)
  location_lat NUMERIC NOT NULL,
  location_lng NUMERIC NOT NULL,
  location_name TEXT NOT NULL,
  location_address TEXT,
  
  -- References
  source_post_id UUID REFERENCES public.instagram_posts(id) ON DELETE SET NULL,
  source_event_id UUID REFERENCES public.events_enriched(id) ON DELETE SET NULL,
  
  -- Metadata
  image_url TEXT,
  instagram_account_username TEXT,
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  
  -- Status
  is_featured BOOLEAN DEFAULT false,
  verified BOOLEAN DEFAULT true,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.published_events ENABLE ROW LEVEL SECURITY;

-- Public read access (everyone can see published events)
CREATE POLICY "Published events are viewable by everyone"
  ON public.published_events
  FOR SELECT
  USING (true);

-- Admins can manage
CREATE POLICY "Admins can manage published events"
  ON public.published_events
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Create indexes for performance
CREATE INDEX idx_published_events_date ON public.published_events(event_date);
CREATE INDEX idx_published_events_location ON public.published_events(location_lat, location_lng);
CREATE INDEX idx_published_events_source_post ON public.published_events(source_post_id);

-- Trigger for updated_at
CREATE TRIGGER update_published_events_updated_at
  BEFORE UPDATE ON public.published_events
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();