-- Add operating_hours to known_venues for storing structured venue hours
ALTER TABLE public.known_venues 
ADD COLUMN IF NOT EXISTS operating_hours JSONB DEFAULT NULL;

-- Add comment explaining the structure
COMMENT ON COLUMN public.known_venues.operating_hours IS 'Structured operating hours: {"regular": {"monday": {"open": "18:00", "close": "01:00", "closed": false}, ...}, "notes": "Extended hours on weekends"}';

-- Add extracted_hours and is_hours_post to instagram_posts for capturing hours from posts
ALTER TABLE public.instagram_posts 
ADD COLUMN IF NOT EXISTS extracted_hours JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS is_hours_post BOOLEAN DEFAULT false;

-- Add comments
COMMENT ON COLUMN public.instagram_posts.extracted_hours IS 'Structured operating hours extracted from venue hours announcement posts';
COMMENT ON COLUMN public.instagram_posts.is_hours_post IS 'True if this post announces venue operating hours (not an event)';