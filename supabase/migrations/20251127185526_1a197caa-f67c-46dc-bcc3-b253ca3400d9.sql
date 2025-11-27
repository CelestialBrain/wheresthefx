-- Create extraction_feedback table for pattern learning
CREATE TABLE IF NOT EXISTS public.extraction_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES public.instagram_posts(id) ON DELETE CASCADE,
  pattern_id UUID REFERENCES public.extraction_patterns(id) ON DELETE SET NULL,
  field_name TEXT NOT NULL,
  original_value TEXT,
  corrected_value TEXT NOT NULL,
  feedback_type TEXT NOT NULL CHECK (feedback_type IN ('correction', 'validation', 'rejection')),
  confidence_score NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Enable RLS on extraction_feedback
ALTER TABLE public.extraction_feedback ENABLE ROW LEVEL SECURITY;

-- RLS policies for extraction_feedback
CREATE POLICY "Admins can manage extraction feedback"
  ON public.extraction_feedback
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can create feedback"
  ON public.extraction_feedback
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Add priority column to extraction_patterns
ALTER TABLE public.extraction_patterns 
ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 100;

-- Create index on priority for faster pattern ordering
CREATE INDEX IF NOT EXISTS idx_extraction_patterns_priority 
  ON public.extraction_patterns(priority, confidence_score DESC);

-- Update RLS policy for scraper_logs to allow client-side OCR logging
DROP POLICY IF EXISTS "Service role can insert scraper logs" ON public.scraper_logs;

CREATE POLICY "Service role and authenticated users can insert logs"
  ON public.scraper_logs
  FOR INSERT
  WITH CHECK (
    (auth.role() = 'service_role') OR 
    (auth.uid() IS NOT NULL AND stage = 'ocr')
  );

-- Reset pattern stats for clean testing with updated regex
UPDATE public.extraction_patterns
SET 
  failure_count = 0,
  success_count = 0,
  last_used_at = NULL,
  is_active = true
WHERE pattern_type IN ('venue', 'price', 'time', 'free');