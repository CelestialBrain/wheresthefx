-- Add new columns to instagram_posts for event lifecycle tracking
ALTER TABLE public.instagram_posts
ADD COLUMN IF NOT EXISTS event_status TEXT DEFAULT 'confirmed',
ADD COLUMN IF NOT EXISTS availability_status TEXT DEFAULT 'available',
ADD COLUMN IF NOT EXISTS price_min NUMERIC,
ADD COLUMN IF NOT EXISTS price_max NUMERIC,
ADD COLUMN IF NOT EXISTS price_notes TEXT,
ADD COLUMN IF NOT EXISTS location_status TEXT DEFAULT 'confirmed';

-- Add CHECK constraints for valid enum values (skip if exists)
DO $$ BEGIN
  ALTER TABLE public.instagram_posts
  ADD CONSTRAINT instagram_posts_event_status_check
  CHECK (event_status IS NULL OR event_status IN ('confirmed', 'rescheduled', 'cancelled', 'postponed', 'tentative'));
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'constraint instagram_posts_event_status_check already exists, skipping';
END $$;

DO $$ BEGIN
  ALTER TABLE public.instagram_posts
  ADD CONSTRAINT instagram_posts_availability_status_check
  CHECK (availability_status IS NULL OR availability_status IN ('available', 'sold_out', 'waitlist', 'limited', 'few_left'));
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'constraint instagram_posts_availability_status_check already exists, skipping';
END $$;

DO $$ BEGIN
  ALTER TABLE public.instagram_posts
  ADD CONSTRAINT instagram_posts_location_status_check
  CHECK (location_status IS NULL OR location_status IN ('confirmed', 'tba', 'secret', 'dm_for_details'));
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'constraint instagram_posts_location_status_check already exists, skipping';
END $$;

-- Create event_dates table for multi-day events
CREATE TABLE IF NOT EXISTS public.event_dates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instagram_post_id UUID NOT NULL REFERENCES public.instagram_posts(id) ON DELETE CASCADE,
  event_date DATE NOT NULL,
  event_time TIME WITHOUT TIME ZONE,
  venue_name TEXT,
  venue_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(instagram_post_id, event_date, venue_name)
);

-- Create event_updates table for tracking rescheduling history
CREATE TABLE IF NOT EXISTS public.event_updates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  original_post_id UUID NOT NULL REFERENCES public.instagram_posts(id) ON DELETE CASCADE,
  update_post_id UUID REFERENCES public.instagram_posts(id) ON DELETE SET NULL,
  update_type TEXT NOT NULL,
  old_date DATE,
  new_date DATE,
  reason TEXT,
  detected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT event_updates_type_check CHECK (update_type IN ('reschedule', 'cancel', 'venue_change', 'time_change', 'info_update'))
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_event_dates_post_id ON public.event_dates(instagram_post_id);
CREATE INDEX IF NOT EXISTS idx_event_dates_date ON public.event_dates(event_date);
CREATE INDEX IF NOT EXISTS idx_event_dates_venue ON public.event_dates(venue_name);
CREATE INDEX IF NOT EXISTS idx_event_updates_original ON public.event_updates(original_post_id);
CREATE INDEX IF NOT EXISTS idx_event_updates_type ON public.event_updates(update_type);
CREATE INDEX IF NOT EXISTS idx_instagram_posts_event_status ON public.instagram_posts(event_status);
CREATE INDEX IF NOT EXISTS idx_instagram_posts_availability ON public.instagram_posts(availability_status);

-- Enable RLS on new tables
ALTER TABLE public.event_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_updates ENABLE ROW LEVEL SECURITY;

-- RLS policies for event_dates
DO $$ BEGIN
  CREATE POLICY "Event dates are viewable by everyone"
  ON public.event_dates
  FOR SELECT
  USING (true);
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'policy "Event dates are viewable by everyone" already exists, skipping';
END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can manage event dates"
  ON public.event_dates
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'policy "Admins can manage event dates" already exists, skipping';
END $$;

-- RLS policies for event_updates
DO $$ BEGIN
  CREATE POLICY "Event updates are viewable by everyone"
  ON public.event_updates
  FOR SELECT
  USING (true);
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'policy "Event updates are viewable by everyone" already exists, skipping';
END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can manage event updates"
  ON public.event_updates
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'policy "Admins can manage event updates" already exists, skipping';
END $$;