-- Phase 1: Create extraction_patterns table
CREATE TABLE IF NOT EXISTS public.extraction_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_type text NOT NULL CHECK (pattern_type IN ('time', 'date', 'venue', 'price', 'address', 'signup_url')),
  pattern_regex text NOT NULL,
  pattern_description text,
  confidence_score numeric DEFAULT 0.5 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  success_count integer DEFAULT 0 CHECK (success_count >= 0),
  failure_count integer DEFAULT 0 CHECK (failure_count >= 0),
  last_used_at timestamptz,
  created_at timestamptz DEFAULT now(),
  is_active boolean DEFAULT true,
  source text DEFAULT 'learned' CHECK (source IN ('default', 'learned', 'manual'))
);

CREATE INDEX IF NOT EXISTS idx_extraction_patterns_type ON public.extraction_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_extraction_patterns_confidence ON public.extraction_patterns(confidence_score DESC);
CREATE INDEX IF NOT EXISTS idx_extraction_patterns_active ON public.extraction_patterns(is_active) WHERE is_active = true;

-- Phase 1: Create extraction_corrections table
CREATE TABLE IF NOT EXISTS public.extraction_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES public.instagram_posts(id) ON DELETE CASCADE,
  field_name text NOT NULL,
  original_ocr_text text,
  original_extracted_value text,
  corrected_value text NOT NULL,
  extraction_method text DEFAULT 'manual',
  pattern_used text,
  created_at timestamptz DEFAULT now(),
  learned_pattern_id uuid REFERENCES public.extraction_patterns(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_extraction_corrections_field ON public.extraction_corrections(field_name);
CREATE INDEX IF NOT EXISTS idx_extraction_corrections_post ON public.extraction_corrections(post_id);
CREATE INDEX IF NOT EXISTS idx_extraction_corrections_created ON public.extraction_corrections(created_at DESC);

-- Enable RLS
ALTER TABLE public.extraction_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extraction_corrections ENABLE ROW LEVEL SECURITY;

-- RLS Policies for extraction_patterns
CREATE POLICY "Admins can manage extraction patterns"
  ON public.extraction_patterns
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Extraction patterns viewable by authenticated users"
  ON public.extraction_patterns
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- RLS Policies for extraction_corrections
CREATE POLICY "Admins can manage extraction corrections"
  ON public.extraction_corrections
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can create corrections"
  ON public.extraction_corrections
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Seed default patterns from existing regex
INSERT INTO public.extraction_patterns (pattern_type, pattern_regex, pattern_description, confidence_score, source) VALUES
  -- Time patterns
  ('time', '(\\d{1,2})[:\\.](\\d{2})\\s*([ap]m)?', 'Time with colon or dot separator', 0.9, 'default'),
  ('time', '(\\d{1,2})\\s*([ap]m)', 'Time with AM/PM', 0.85, 'default'),
  ('time', '(\\d{1,2}h\\d{2})', 'European time format (e.g., 19h30)', 0.8, 'default'),
  
  -- Date patterns
  ('date', '(\\d{1,2})[/-](\\d{1,2})[/-](\\d{2,4})', 'Date with slashes or dashes', 0.9, 'default'),
  ('date', '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\s+(\\d{1,2})', 'Month name + day', 0.85, 'default'),
  ('date', '(\\d{1,2})\\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)', 'Day + month name', 0.85, 'default'),
  
  -- Venue patterns
  ('venue', '@\\s*([A-Z][a-zA-Z0-9\\s]+)', 'Venue with @ mention', 0.8, 'default'),
  ('venue', '(?:at|@)\\s+([A-Z][a-zA-Z\\s]+?)(?=\\s*[,\\n]|$)', 'Venue after at/@', 0.75, 'default'),
  
  -- Price patterns
  ('price', '\\$\\s*(\\d+(?:\\.\\d{2})?)', 'Dollar amount', 0.9, 'default'),
  ('price', '(\\d+)\\s*(?:dollars?|bucks?)', 'Price in words', 0.85, 'default'),
  ('price', '(?:€|£)\\s*(\\d+(?:\\.\\d{2})?)', 'Euro/Pound amount', 0.85, 'default'),
  
  -- Signup URL patterns
  ('signup_url', '(https?://[^\\s]+)', 'Standard HTTP/HTTPS URL', 0.9, 'default'),
  ('signup_url', '(bit\\.ly/[a-zA-Z0-9]+)', 'Bitly short link', 0.85, 'default'),
  ('signup_url', '(eventbrite\\.com/[^\\s]+)', 'Eventbrite URL', 0.9, 'default')
ON CONFLICT DO NOTHING;