-- Event Lifecycle and Data Enrichment Schema
-- Adds event status tracking, availability, pricing, source authority, and location status

-- Add event_status column to instagram_posts for lifecycle tracking
ALTER TABLE instagram_posts 
  ADD COLUMN IF NOT EXISTS event_status TEXT DEFAULT 'confirmed' 
  CHECK (event_status IN ('confirmed', 'rescheduled', 'cancelled', 'postponed', 'tentative'));

-- Create event_updates table to track rescheduling history
CREATE TABLE IF NOT EXISTS event_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_post_id TEXT,
  update_post_id TEXT,
  update_type TEXT CHECK (update_type IN ('reschedule', 'cancel', 'venue_change', 'time_change', 'info_update')),
  old_date DATE,
  new_date DATE,
  reason TEXT,
  detected_at TIMESTAMPTZ DEFAULT now()
);

-- Add indexes for event_updates
CREATE INDEX IF NOT EXISTS idx_event_updates_original ON event_updates(original_post_id);
CREATE INDEX IF NOT EXISTS idx_event_updates_type ON event_updates(update_type);

-- Add availability_status column for sold out / waitlist tracking
ALTER TABLE instagram_posts 
  ADD COLUMN IF NOT EXISTS availability_status TEXT DEFAULT 'available'
  CHECK (availability_status IN ('available', 'sold_out', 'waitlist', 'limited', 'few_left'));

-- Add price range support columns
ALTER TABLE instagram_posts 
  ADD COLUMN IF NOT EXISTS price_min NUMERIC,
  ADD COLUMN IF NOT EXISTS price_max NUMERIC,
  ADD COLUMN IF NOT EXISTS price_notes TEXT;

-- Add source authority scoring for deduplication
ALTER TABLE instagram_posts 
  ADD COLUMN IF NOT EXISTS source_authority INT DEFAULT 50;

-- Add location status for pop-ups and TBA venues
ALTER TABLE instagram_posts 
  ADD COLUMN IF NOT EXISTS location_status TEXT DEFAULT 'confirmed'
  CHECK (location_status IN ('confirmed', 'tba', 'secret', 'dm_for_details'));

-- Add index for source_authority to improve deduplication performance
CREATE INDEX IF NOT EXISTS idx_instagram_posts_source_authority ON instagram_posts(source_authority);
