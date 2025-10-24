-- Fix the 14 broken posts that have event data but wrong status
-- These posts have is_event = true and event_date populated
-- but ocr_processed = false and needs_review = false
UPDATE instagram_posts
SET 
  ocr_processed = true,
  needs_review = true
WHERE 
  ocr_processed = false 
  AND is_event = true 
  AND event_date IS NOT NULL;