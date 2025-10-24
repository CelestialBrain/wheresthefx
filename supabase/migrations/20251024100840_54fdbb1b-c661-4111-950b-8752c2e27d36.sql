-- Remove events_enriched table (consolidating to published_events only)
DROP TABLE IF EXISTS public.events_enriched CASCADE;

-- Create OCR cache table for storing OCR results by image hash
CREATE TABLE IF NOT EXISTS public.ocr_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_hash TEXT NOT NULL UNIQUE,
  image_url TEXT NOT NULL,
  ocr_text TEXT,
  ocr_confidence NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ DEFAULT now(),
  use_count INTEGER DEFAULT 1
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_ocr_cache_hash ON public.ocr_cache(image_hash);
CREATE INDEX IF NOT EXISTS idx_ocr_cache_last_used ON public.ocr_cache(last_used_at);

-- Add topic modeling and enhanced fields to instagram_posts
ALTER TABLE public.instagram_posts 
  ADD COLUMN IF NOT EXISTS topic_label TEXT,
  ADD COLUMN IF NOT EXISTS topic_confidence NUMERIC,
  ADD COLUMN IF NOT EXISTS entity_extraction_method TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS stored_image_url TEXT,
  ADD COLUMN IF NOT EXISTS image_storage_path TEXT;

-- Update published_events to have all fields needed
ALTER TABLE public.published_events
  ADD COLUMN IF NOT EXISTS topic_label TEXT,
  ADD COLUMN IF NOT EXISTS end_date DATE,
  ADD COLUMN IF NOT EXISTS instagram_post_url TEXT,
  ADD COLUMN IF NOT EXISTS caption TEXT;

-- Enable RLS on ocr_cache
ALTER TABLE public.ocr_cache ENABLE ROW LEVEL SECURITY;

-- Allow admins to manage OCR cache
CREATE POLICY "Admins can manage OCR cache"
ON public.ocr_cache
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow service role full access to OCR cache (for edge functions)
CREATE POLICY "Service role can manage OCR cache"
ON public.ocr_cache
FOR ALL
USING (true);