-- Phase 4: Add sub_events JSONB field to instagram_posts for multi-event posts
-- This stores multiple events from a single Instagram post (e.g., different artists/activities per day)

ALTER TABLE public.instagram_posts 
ADD COLUMN IF NOT EXISTS sub_events jsonb DEFAULT NULL;

-- Add comment explaining the structure
COMMENT ON COLUMN public.instagram_posts.sub_events IS 'Array of sub-events for multi-event posts. Structure: [{"title": "Artist A", "date": "2025-12-12", "time": "18:00", "endTime": "20:00"}, ...]';

-- Also add signupUrl type tracking for better URL categorization
ALTER TABLE public.instagram_posts
ADD COLUMN IF NOT EXISTS url_type text DEFAULT NULL;

COMMENT ON COLUMN public.instagram_posts.url_type IS 'Type of signup URL: tickets, registration, rsvp, info, link_in_bio';