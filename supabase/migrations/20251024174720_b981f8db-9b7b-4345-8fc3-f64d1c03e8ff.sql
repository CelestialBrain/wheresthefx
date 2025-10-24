-- Ensure stored_image_url column exists (safe to run multiple times)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'instagram_posts' 
    AND column_name = 'stored_image_url'
  ) THEN
    ALTER TABLE public.instagram_posts 
    ADD COLUMN stored_image_url text;
  END IF;
END $$;

-- Add index for efficient querying of posts needing image storage
CREATE INDEX IF NOT EXISTS idx_instagram_posts_image_storage 
ON public.instagram_posts (stored_image_url) 
WHERE stored_image_url IS NULL AND image_url IS NOT NULL;