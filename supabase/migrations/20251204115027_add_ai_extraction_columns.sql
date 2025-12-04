-- Add columns for AI-powered event extraction to instagram_posts table

-- AI extraction result as JSONB (stores full extraction result from Gemini)
ALTER TABLE instagram_posts ADD COLUMN IF NOT EXISTS ai_extraction jsonb;

-- Method used for extraction: 'regex', 'ai', 'ai_corrected'
ALTER TABLE instagram_posts ADD COLUMN IF NOT EXISTS extraction_method text DEFAULT 'regex';

-- AI confidence score (0.0 to 1.0)
ALTER TABLE instagram_posts ADD COLUMN IF NOT EXISTS ai_confidence numeric;

-- AI reasoning explanation for the extraction
ALTER TABLE instagram_posts ADD COLUMN IF NOT EXISTS ai_reasoning text;

-- Add comment for documentation
COMMENT ON COLUMN instagram_posts.ai_extraction IS 'Full AI extraction result from Gemini including additionalDates, confidence, etc.';
COMMENT ON COLUMN instagram_posts.extraction_method IS 'Method used for extraction: regex (default), ai (AI primary), ai_corrected (AI corrected regex)';
COMMENT ON COLUMN instagram_posts.ai_confidence IS 'AI confidence score from 0.0 to 1.0 for the extraction';
COMMENT ON COLUMN instagram_posts.ai_reasoning IS 'AI reasoning explaining how the extraction was performed';

-- Add index on extraction_method for filtering
CREATE INDEX IF NOT EXISTS idx_instagram_posts_extraction_method ON instagram_posts(extraction_method);
