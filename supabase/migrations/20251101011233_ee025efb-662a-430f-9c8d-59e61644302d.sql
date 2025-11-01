-- Add published_event_id column to saved_events table
ALTER TABLE public.saved_events 
ADD COLUMN IF NOT EXISTS published_event_id uuid REFERENCES public.published_events(id) ON DELETE CASCADE;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_saved_events_published_event_id 
ON public.saved_events(published_event_id);

-- Backfill published_event_id for existing saved events
-- This links saved events to their corresponding published events via instagram_post_id
UPDATE public.saved_events se
SET published_event_id = pe.id
FROM public.published_events pe
WHERE se.instagram_post_id = pe.source_post_id
  AND se.published_event_id IS NULL;