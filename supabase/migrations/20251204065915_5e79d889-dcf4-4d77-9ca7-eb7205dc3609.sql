-- Fix double-escaped regex patterns in extraction_patterns table
-- Replace \\\\b with \\b, \\\\d with \\d, \\\\s with \\s, \\\\[ with \\[

UPDATE extraction_patterns 
SET pattern_regex = REPLACE(
  REPLACE(
    REPLACE(
      REPLACE(pattern_regex, '\\\\b', '\\b'),
      '\\\\d', '\\d'
    ),
    '\\\\s', '\\s'
  ),
  '\\\\[', '\\['
)
WHERE pattern_regex LIKE '%\\\\b%' 
   OR pattern_regex LIKE '%\\\\d%' 
   OR pattern_regex LIKE '%\\\\s%'
   OR pattern_regex LIKE '%\\\\[%';