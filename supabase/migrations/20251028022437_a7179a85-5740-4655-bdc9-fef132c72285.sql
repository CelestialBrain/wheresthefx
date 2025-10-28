-- Clean up stuck scrape runs
UPDATE scrape_runs 
SET status = 'failed', 
    completed_at = NOW(),
    error_message = 'Process timed out - marked as failed by cleanup job'
WHERE status = 'running' 
AND started_at < NOW() - INTERVAL '1 hour';

-- Create index on post_rejections for faster lookups
CREATE INDEX IF NOT EXISTS idx_post_rejections_post_id ON post_rejections(post_id);

-- Create index on instagram_posts for better query performance
CREATE INDEX IF NOT EXISTS idx_instagram_posts_post_id ON instagram_posts(post_id);