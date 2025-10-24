-- Add end_time column to instagram_posts table
ALTER TABLE public.instagram_posts 
ADD COLUMN IF NOT EXISTS end_time time without time zone;

-- Add event_end_date column to instagram_posts table  
ALTER TABLE public.instagram_posts
ADD COLUMN IF NOT EXISTS event_end_date date;

-- Add comment for documentation
COMMENT ON COLUMN public.instagram_posts.end_time IS 'Optional end time for multi-day or time-range events';
COMMENT ON COLUMN public.instagram_posts.event_end_date IS 'Optional end date for multi-day events';