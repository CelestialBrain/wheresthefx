-- Phase 1: Clean up duplicates and add unique constraints

-- 1. Delete duplicate pattern suggestions (keep the newest of each unique combo)
DELETE FROM pattern_suggestions
WHERE id NOT IN (
  SELECT DISTINCT ON (pattern_type, correct_value, raw_text) id
  FROM pattern_suggestions
  ORDER BY pattern_type, correct_value, raw_text, created_at DESC
);

-- 2. Delete duplicate extraction_patterns (keep oldest/most established)
DELETE FROM extraction_patterns
WHERE id NOT IN (
  SELECT DISTINCT ON (pattern_type, pattern_regex) id
  FROM extraction_patterns
  ORDER BY pattern_type, pattern_regex, created_at ASC
);

-- 3. Add unique constraint on pattern_suggestions to prevent future duplicates
-- Using a partial unique index that only applies to pending suggestions
CREATE UNIQUE INDEX IF NOT EXISTS idx_pattern_suggestions_unique_pending
ON pattern_suggestions (pattern_type, correct_value, COALESCE(raw_text, ''))
WHERE status = 'pending';

-- 4. Add unique constraint on extraction_patterns to prevent duplicate patterns
CREATE UNIQUE INDEX IF NOT EXISTS idx_extraction_patterns_unique 
ON extraction_patterns (pattern_type, pattern_regex);

-- 5. Add index for faster suggestion lookups
CREATE INDEX IF NOT EXISTS idx_pattern_suggestions_status_type 
ON pattern_suggestions (status, pattern_type);

-- 6. Add index for pattern queries
CREATE INDEX IF NOT EXISTS idx_extraction_patterns_active_type 
ON extraction_patterns (is_active, pattern_type) 
WHERE is_active = true;