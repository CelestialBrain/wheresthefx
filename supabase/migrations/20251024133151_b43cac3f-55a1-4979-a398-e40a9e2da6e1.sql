-- Phase 1: Add event_end_date columns to support multi-day events

-- Add end date column to instagram_posts
ALTER TABLE instagram_posts 
ADD COLUMN IF NOT EXISTS event_end_date DATE DEFAULT NULL;

-- Add end date column to published_events
ALTER TABLE published_events 
ADD COLUMN IF NOT EXISTS event_end_date DATE DEFAULT NULL;

-- Set default values for existing events (end date = start date)
UPDATE instagram_posts 
SET event_end_date = event_date 
WHERE event_date IS NOT NULL AND event_end_date IS NULL;

UPDATE published_events 
SET event_end_date = event_date 
WHERE event_date IS NOT NULL AND event_end_date IS NULL;

-- Create index for efficient date range queries (without immutable predicate)
CREATE INDEX IF NOT EXISTS idx_published_events_date_range 
ON published_events(event_date, event_end_date);

CREATE INDEX IF NOT EXISTS idx_instagram_posts_date_range 
ON instagram_posts(event_date, event_end_date);

-- Add comments for documentation
COMMENT ON COLUMN instagram_posts.event_end_date IS 'End date for multi-day events. Defaults to event_date for single-day events.';
COMMENT ON COLUMN published_events.event_end_date IS 'End date for multi-day events. Defaults to event_date for single-day events.';