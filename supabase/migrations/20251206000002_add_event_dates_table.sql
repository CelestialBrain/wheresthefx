-- Create event_dates junction table for multi-date range support
-- This table stores all date ranges for events that occur on multiple dates/venues
-- (e.g., "Dec 6-7", "Friday & Saturday at different venues")

CREATE TABLE IF NOT EXISTS public.event_dates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instagram_post_id uuid NOT NULL REFERENCES public.instagram_posts(id) ON DELETE CASCADE,
  event_date date NOT NULL,
  event_time time,
  venue_name text,
  venue_address text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(instagram_post_id, event_date, venue_name)
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_event_dates_post_id ON public.event_dates(instagram_post_id);
CREATE INDEX IF NOT EXISTS idx_event_dates_date ON public.event_dates(event_date);
CREATE INDEX IF NOT EXISTS idx_event_dates_venue ON public.event_dates(venue_name);
CREATE INDEX IF NOT EXISTS idx_event_dates_post_date ON public.event_dates(instagram_post_id, event_date);

-- Enable RLS on event_dates
ALTER TABLE public.event_dates ENABLE ROW LEVEL SECURITY;

-- RLS Policies for event_dates
CREATE POLICY "Event dates viewable by authenticated users"
  ON public.event_dates
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage event dates"
  ON public.event_dates
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Add comment explaining the table
COMMENT ON TABLE public.event_dates IS 
  'Stores additional date/venue combinations for multi-date events. The primary date/venue is stored in instagram_posts table.';
