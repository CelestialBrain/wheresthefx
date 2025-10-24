-- Add missing pricing fields to instagram_posts for Option A workflow
-- These columns allow saving free/paid state and price directly on posts used by map/sidebar
ALTER TABLE public.instagram_posts
ADD COLUMN IF NOT EXISTS is_free boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS price numeric NULL;

-- Optional: index for filtering by price quickly
CREATE INDEX IF NOT EXISTS idx_instagram_posts_is_free ON public.instagram_posts(is_free);
