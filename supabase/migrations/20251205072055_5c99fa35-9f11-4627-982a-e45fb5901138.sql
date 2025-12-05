-- Fix the regex patterns - restore proper backslash escaping
-- The previous migration incorrectly converted patterns, need to restore them

-- First, let's restore patterns that now have d{, s+, etc. without backslashes
-- by adding backslashes back where regex metacharacters are expected

-- Fix digit patterns: d{ -> \d{
UPDATE extraction_patterns
SET pattern_regex = REGEXP_REPLACE(pattern_regex, '([^\\])d\{', E'\\1\\\\d{', 'g')
WHERE pattern_regex ~ '[^\\]d\{';

-- Fix word boundary: (b( at start -> (\b(
UPDATE extraction_patterns
SET pattern_regex = REGEXP_REPLACE(pattern_regex, '^b\(', E'\\\\b(', 'g')
WHERE pattern_regex ~ '^b\(';

-- Fix standalone b( -> \b(
UPDATE extraction_patterns
SET pattern_regex = REGEXP_REPLACE(pattern_regex, '([^\\a-z])b\(', E'\\1\\\\b(', 'g')
WHERE pattern_regex ~ '[^\\a-z]b\(';

-- Fix whitespace: s+ -> \s+, s* -> \s*
UPDATE extraction_patterns
SET pattern_regex = REGEXP_REPLACE(pattern_regex, '([^\\a-z])s([+*?])', E'\\1\\\\s\\2', 'g')
WHERE pattern_regex ~ '[^\\a-z]s[+*?]';

-- Fix patterns starting with ( that should have \b
UPDATE extraction_patterns
SET pattern_regex = REGEXP_REPLACE(pattern_regex, '^\(d\{', E'(\\\\d{', 'g')
WHERE pattern_regex ~ '^\(d\{';

-- Actually, let's just directly fix the known broken patterns by resetting them
-- to correct values based on their descriptions

-- ISO date format should be: (\d{4})-(\d{2})-(\d{2})
UPDATE extraction_patterns
SET pattern_regex = E'(\\d{4})-(\\d{2})-(\\d{2})'
WHERE pattern_description = 'ISO date format YYYY-MM-DD';

-- Let's check what patterns look like now and we may need manual fixes