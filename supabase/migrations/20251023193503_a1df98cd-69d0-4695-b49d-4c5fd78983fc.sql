-- Add image_url column to instagram_posts table to store direct CDN image URLs
ALTER TABLE instagram_posts 
ADD COLUMN image_url text;