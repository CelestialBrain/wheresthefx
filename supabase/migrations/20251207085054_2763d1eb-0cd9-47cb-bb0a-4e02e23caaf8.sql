-- Add published_event_id column to event_dates for linking to published events
ALTER TABLE public.event_dates 
ADD COLUMN published_event_id UUID REFERENCES public.published_events(id) ON DELETE CASCADE;

-- Make instagram_post_id nullable since dates can belong to either instagram_posts OR published_events
ALTER TABLE public.event_dates 
ALTER COLUMN instagram_post_id DROP NOT NULL;

-- Add index for efficient lookups by published_event_id
CREATE INDEX idx_event_dates_published_event_id ON public.event_dates(published_event_id);

-- Add comment for clarity
COMMENT ON COLUMN public.event_dates.published_event_id IS 'Links to published_events for public-facing event dates';