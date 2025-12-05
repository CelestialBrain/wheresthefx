-- Add attempt_count column to track failed generation attempts
ALTER TABLE pattern_suggestions ADD COLUMN IF NOT EXISTS attempt_count INTEGER DEFAULT 0;

-- Add index for efficient querying of pending suggestions with low attempt count
CREATE INDEX IF NOT EXISTS idx_pattern_suggestions_pending_attempts ON pattern_suggestions(status, attempt_count) WHERE status = 'pending';