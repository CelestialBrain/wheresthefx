-- Fix 1: Update extraction_patterns source constraint to allow 'ai_learned'
ALTER TABLE extraction_patterns 
DROP CONSTRAINT IF EXISTS extraction_patterns_source_check;

ALTER TABLE extraction_patterns 
ADD CONSTRAINT extraction_patterns_source_check 
CHECK (source = ANY (ARRAY['default'::text, 'learned'::text, 'manual'::text, 'ai_learned'::text]));

-- Fix 2: Normalize existing pattern_type values in pattern_suggestions
UPDATE pattern_suggestions 
SET pattern_type = 'date' 
WHERE pattern_type = 'event_date';

UPDATE pattern_suggestions 
SET pattern_type = 'time' 
WHERE pattern_type = 'event_time';

UPDATE pattern_suggestions 
SET pattern_type = 'venue' 
WHERE pattern_type = 'location_name';

UPDATE pattern_suggestions 
SET pattern_type = 'address' 
WHERE pattern_type = 'location_address';

UPDATE pattern_suggestions 
SET pattern_type = 'signup_url' 
WHERE pattern_type = 'signupUrl';