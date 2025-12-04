-- Drop the foreign key constraint first
ALTER TABLE post_rejections DROP CONSTRAINT IF EXISTS post_rejections_post_id_fkey;

-- Change post_id column type to text
ALTER TABLE post_rejections 
ALTER COLUMN post_id TYPE text USING post_id::text;

-- Add additional_images column for carousel support
ALTER TABLE instagram_posts 
ADD COLUMN IF NOT EXISTS additional_images text[] DEFAULT NULL;