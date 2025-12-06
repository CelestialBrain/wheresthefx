-- Deactivate patterns with 100% failure rate and 10+ attempts
UPDATE extraction_patterns
SET is_active = false
WHERE success_count = 0 
  AND failure_count >= 10
  AND is_active = true;

-- Deactivate patterns with >66% failure rate and 10+ attempts  
UPDATE extraction_patterns
SET is_active = false
WHERE (success_count + failure_count) > 10
  AND failure_count > success_count * 2
  AND is_active = true;