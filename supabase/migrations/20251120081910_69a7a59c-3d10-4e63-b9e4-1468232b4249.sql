-- Phase 1: Add ocr_text column to store raw OCR output
ALTER TABLE instagram_posts 
ADD COLUMN IF NOT EXISTS ocr_text TEXT;

-- Create full-text search index on ocr_text for better search performance
CREATE INDEX IF NOT EXISTS idx_instagram_posts_ocr_text 
ON instagram_posts USING gin(to_tsvector('english', ocr_text));

-- Add tags column for auto-tagging system
ALTER TABLE instagram_posts 
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- Create GIN index on tags for efficient array operations
CREATE INDEX IF NOT EXISTS idx_instagram_posts_tags 
ON instagram_posts USING gin(tags);

-- Add configurable scrape depth per Instagram account
ALTER TABLE instagram_accounts 
ADD COLUMN IF NOT EXISTS scrape_depth INTEGER DEFAULT 5;

COMMENT ON COLUMN instagram_accounts.scrape_depth IS 'Number of posts to scrape per run (default: 5)';
COMMENT ON COLUMN instagram_posts.ocr_text IS 'Raw OCR text extracted from post image';
COMMENT ON COLUMN instagram_posts.tags IS 'Auto-generated tags for filtering (e.g., music, outdoor, free, weekend)';