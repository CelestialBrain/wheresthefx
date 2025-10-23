-- Add new fields to instagram_posts for OCR processing
ALTER TABLE instagram_posts 
ADD COLUMN IF NOT EXISTS needs_review BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS ocr_processed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS ocr_last_attempt TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS ocr_confidence DECIMAL(5,2);

-- Create saved_events table
CREATE TABLE IF NOT EXISTS saved_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  instagram_post_id UUID REFERENCES instagram_posts(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, instagram_post_id)
);

-- Enable RLS on saved_events
ALTER TABLE saved_events ENABLE ROW LEVEL SECURITY;

-- Policies for saved_events
CREATE POLICY "Users can view their own saved events"
  ON saved_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can save events"
  ON saved_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their saved events"
  ON saved_events FOR DELETE
  USING (auth.uid() = user_id);

-- Create event_reports table
CREATE TABLE IF NOT EXISTS event_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instagram_post_id UUID REFERENCES instagram_posts(id) ON DELETE CASCADE,
  reporter_user_id UUID REFERENCES profiles(id),
  report_type TEXT CHECK (report_type IN ('outdated', 'wrong_location', 'wrong_date', 'spam', 'other')),
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on event_reports
ALTER TABLE event_reports ENABLE ROW LEVEL SECURITY;

-- Policies for event_reports
CREATE POLICY "Users can create reports"
  ON event_reports FOR INSERT
  WITH CHECK (auth.uid() = reporter_user_id);

CREATE POLICY "Admins can view all reports"
  ON event_reports FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Create event_groups table for deduplication
CREATE TABLE IF NOT EXISTS event_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_post_id UUID REFERENCES instagram_posts(id) ON DELETE CASCADE,
  merged_post_ids UUID[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on event_groups
ALTER TABLE event_groups ENABLE ROW LEVEL SECURITY;

-- Policy for event_groups (viewable by everyone)
CREATE POLICY "Event groups are viewable by everyone"
  ON event_groups FOR SELECT
  USING (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_instagram_posts_location ON instagram_posts(location_lat, location_lng);
CREATE INDEX IF NOT EXISTS idx_instagram_posts_event_date ON instagram_posts(event_date) WHERE is_event = true;
CREATE INDEX IF NOT EXISTS idx_instagram_posts_needs_review ON instagram_posts(needs_review) WHERE needs_review = true;
CREATE INDEX IF NOT EXISTS idx_instagram_posts_account ON instagram_posts(instagram_account_id);
CREATE INDEX IF NOT EXISTS idx_saved_events_user ON saved_events(user_id);
CREATE INDEX IF NOT EXISTS idx_event_reports_post ON event_reports(instagram_post_id);