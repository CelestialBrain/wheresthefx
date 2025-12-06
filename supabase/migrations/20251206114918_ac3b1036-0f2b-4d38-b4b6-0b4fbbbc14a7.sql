-- Phase 1: Data Reliability Improvements - Schema Updates

-- 1.1 Add new columns to instagram_posts table
ALTER TABLE instagram_posts 
ADD COLUMN IF NOT EXISTS review_tier TEXT CHECK (review_tier IN ('ready', 'quick', 'full', 'rejected')) DEFAULT 'full',
ADD COLUMN IF NOT EXISTS validation_warnings TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS duplicate_of UUID REFERENCES instagram_posts(id),
ADD COLUMN IF NOT EXISTS is_duplicate BOOLEAN DEFAULT false;

-- 1.2 Add index for duplicate detection (venue + date for events)
CREATE INDEX IF NOT EXISTS idx_posts_venue_date 
ON instagram_posts(location_name, event_date) 
WHERE is_event = true AND is_duplicate = false;

-- 1.3 Add index for tier-based queries
CREATE INDEX IF NOT EXISTS idx_posts_review_tier 
ON instagram_posts(review_tier) 
WHERE is_event = true;

-- 1.4 Create validation_logs table for tracking validation issues
CREATE TABLE IF NOT EXISTS validation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instagram_post_id UUID REFERENCES instagram_posts(id) ON DELETE CASCADE,
  warning_type TEXT NOT NULL,
  original_value TEXT,
  corrected_value TEXT,
  field_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 1.5 Add indices for validation_logs
CREATE INDEX IF NOT EXISTS idx_validation_logs_post ON validation_logs(instagram_post_id);
CREATE INDEX IF NOT EXISTS idx_validation_logs_type ON validation_logs(warning_type);

-- 1.6 Enable RLS on validation_logs
ALTER TABLE validation_logs ENABLE ROW LEVEL SECURITY;

-- 1.7 RLS policies for validation_logs
CREATE POLICY "Admins can manage validation logs" 
ON validation_logs FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can insert validation logs" 
ON validation_logs FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Authenticated users can view validation logs"
ON validation_logs FOR SELECT
USING (auth.uid() IS NOT NULL);

-- 1.8 Backfill existing posts with review_tier based on ai_confidence
UPDATE instagram_posts
SET review_tier = CASE
  -- Ready tier: High confidence (85%+) with core fields present
  WHEN ai_confidence >= 0.85 
    AND event_date IS NOT NULL 
    AND event_time IS NOT NULL 
    AND location_name IS NOT NULL 
    AND location_lat IS NOT NULL
  THEN 'ready'
  
  -- Quick tier: Good confidence (65-84%) with date and venue
  WHEN ai_confidence >= 0.65 
    AND event_date IS NOT NULL 
    AND location_name IS NOT NULL
  THEN 'quick'
  
  -- Rejected tier: Very low confidence (<40%) or not an event
  WHEN ai_confidence < 0.40 OR is_event = false
  THEN 'rejected'
  
  -- Full tier: Everything else needs manual review
  ELSE 'full'
END
WHERE review_tier IS NULL OR review_tier = 'full';