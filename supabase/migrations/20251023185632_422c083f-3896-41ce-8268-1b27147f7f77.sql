-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_instagram_posts_event_date ON instagram_posts(event_date) WHERE is_event = true;
CREATE INDEX IF NOT EXISTS idx_instagram_posts_location_coords ON instagram_posts(location_lat, location_lng) WHERE is_event = true;
CREATE INDEX IF NOT EXISTS idx_instagram_posts_post_id ON instagram_posts(post_id);
CREATE INDEX IF NOT EXISTS idx_instagram_posts_account_id ON instagram_posts(instagram_account_id);
CREATE INDEX IF NOT EXISTS idx_instagram_posts_needs_review ON instagram_posts(needs_review) WHERE needs_review = true;
CREATE INDEX IF NOT EXISTS idx_instagram_posts_ocr_processed ON instagram_posts(ocr_processed) WHERE ocr_processed = false;

-- Add index for event groups deduplication
CREATE INDEX IF NOT EXISTS idx_event_groups_primary_post ON event_groups(primary_post_id);
CREATE INDEX IF NOT EXISTS idx_event_groups_merged_posts ON event_groups USING GIN(merged_post_ids);

-- Add index for faster saved events lookup
CREATE INDEX IF NOT EXISTS idx_saved_events_user_post ON saved_events(user_id, instagram_post_id);

-- Add index for Instagram accounts username lookup
CREATE INDEX IF NOT EXISTS idx_instagram_accounts_username ON instagram_accounts(username);

-- Optimize popular_instagram_accounts view query
CREATE INDEX IF NOT EXISTS idx_instagram_accounts_follower_count ON instagram_accounts(follower_count DESC) WHERE is_active = true;