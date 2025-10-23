-- Create table for tracked Instagram accounts
CREATE TABLE public.instagram_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT,
  follower_count INTEGER,
  is_verified BOOLEAN DEFAULT false,
  profile_pic_url TEXT,
  bio TEXT,
  is_active BOOLEAN DEFAULT true,
  last_scraped_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for scraped Instagram posts
CREATE TABLE public.instagram_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instagram_account_id UUID NOT NULL REFERENCES public.instagram_accounts(id) ON DELETE CASCADE,
  post_id TEXT NOT NULL UNIQUE,
  caption TEXT,
  post_url TEXT NOT NULL,
  posted_at TIMESTAMP WITH TIME ZONE NOT NULL,
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  
  -- Parsed event data from caption
  event_title TEXT,
  event_date DATE,
  event_time TIME,
  location_name TEXT,
  location_address TEXT,
  location_lat NUMERIC,
  location_lng NUMERIC,
  signup_url TEXT,
  
  -- Metadata
  hashtags TEXT[],
  mentions TEXT[],
  is_event BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.instagram_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_posts ENABLE ROW LEVEL SECURITY;

-- Instagram accounts are viewable by everyone
CREATE POLICY "Instagram accounts are viewable by everyone"
ON public.instagram_accounts
FOR SELECT
USING (is_active = true);

-- Admins can manage Instagram accounts
CREATE POLICY "Admins can manage Instagram accounts"
ON public.instagram_accounts
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Instagram posts are viewable by everyone
CREATE POLICY "Instagram posts are viewable by everyone"
ON public.instagram_posts
FOR SELECT
USING (true);

-- Admins can manage Instagram posts
CREATE POLICY "Admins can manage Instagram posts"
ON public.instagram_posts
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create indexes for better query performance
CREATE INDEX idx_instagram_posts_account_id ON public.instagram_posts(instagram_account_id);
CREATE INDEX idx_instagram_posts_posted_at ON public.instagram_posts(posted_at DESC);
CREATE INDEX idx_instagram_posts_is_event ON public.instagram_posts(is_event) WHERE is_event = true;
CREATE INDEX idx_instagram_posts_event_date ON public.instagram_posts(event_date) WHERE event_date IS NOT NULL;
CREATE INDEX idx_instagram_posts_location ON public.instagram_posts(location_lat, location_lng) WHERE location_lat IS NOT NULL AND location_lng IS NOT NULL;

-- Trigger for updated_at on instagram_accounts
CREATE TRIGGER update_instagram_accounts_updated_at
BEFORE UPDATE ON public.instagram_accounts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for updated_at on instagram_posts
CREATE TRIGGER update_instagram_posts_updated_at
BEFORE UPDATE ON public.instagram_posts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();