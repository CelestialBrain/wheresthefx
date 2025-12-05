-- Fix double-escaped regex patterns in extraction_patterns table
-- These patterns have \\b, \\d, \\s stored as literal backslash characters instead of regex metacharacters

-- Fix \\b -> \b (word boundary)
UPDATE extraction_patterns
SET pattern_regex = REPLACE(pattern_regex, '\\b', E'\b')
WHERE pattern_regex LIKE '%\\b%';

-- Fix \\d -> \d (digit)
UPDATE extraction_patterns
SET pattern_regex = REPLACE(pattern_regex, '\\d', E'\d')
WHERE pattern_regex LIKE '%\\d%';

-- Fix \\s -> \s (whitespace)
UPDATE extraction_patterns
SET pattern_regex = REPLACE(pattern_regex, '\\s', E'\s')
WHERE pattern_regex LIKE '%\\s%';

-- Fix \\n -> \n (newline)
UPDATE extraction_patterns
SET pattern_regex = REPLACE(pattern_regex, '\\n', E'\n')
WHERE pattern_regex LIKE '%\\n%';

-- Fix \\r -> \r (carriage return)
UPDATE extraction_patterns
SET pattern_regex = REPLACE(pattern_regex, '\\r', E'\r')
WHERE pattern_regex LIKE '%\\r%';

-- Fix \\[ -> \[ (escaped bracket)
UPDATE extraction_patterns
SET pattern_regex = REPLACE(pattern_regex, '\\[', E'\[')
WHERE pattern_regex LIKE '%\\[%';

-- Fix \\] -> \] (escaped bracket)
UPDATE extraction_patterns
SET pattern_regex = REPLACE(pattern_regex, '\\]', E'\]')
WHERE pattern_regex LIKE '%\\]%';