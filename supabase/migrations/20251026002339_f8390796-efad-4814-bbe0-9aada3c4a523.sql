-- Add stored_image_url column to published_events
ALTER TABLE published_events 
ADD COLUMN IF NOT EXISTS stored_image_url text;

-- Backfill stored_image_url from source posts
UPDATE published_events pe
SET stored_image_url = ip.stored_image_url
FROM instagram_posts ip
WHERE pe.source_post_id = ip.id
AND pe.stored_image_url IS NULL;

-- Backfill correct usernames from instagram_accounts
UPDATE published_events pe
SET instagram_account_username = ia.username
FROM instagram_posts ip
JOIN instagram_accounts ia ON ip.instagram_account_id = ia.id
WHERE pe.source_post_id = ip.id
AND pe.instagram_account_username ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';