-- Create extraction_ground_truth table for storing AI results as training data
CREATE TABLE IF NOT EXISTS public.extraction_ground_truth (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES public.instagram_posts(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  correct_value TEXT NOT NULL,
  ai_confidence FLOAT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for extraction_ground_truth
CREATE INDEX IF NOT EXISTS idx_extraction_ground_truth_post_id ON public.extraction_ground_truth(post_id);
CREATE INDEX IF NOT EXISTS idx_extraction_ground_truth_field ON public.extraction_ground_truth(field_name);
CREATE INDEX IF NOT EXISTS idx_extraction_ground_truth_created ON public.extraction_ground_truth(created_at DESC);

-- Create pattern_suggestions table for AI-generated pattern queue
CREATE TABLE IF NOT EXISTS public.pattern_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_type TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  correct_value TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'generated')),
  generated_pattern TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for pattern_suggestions
CREATE INDEX IF NOT EXISTS idx_pattern_suggestions_status ON public.pattern_suggestions(status);
CREATE INDEX IF NOT EXISTS idx_pattern_suggestions_type ON public.pattern_suggestions(pattern_type);
CREATE INDEX IF NOT EXISTS idx_pattern_suggestions_created ON public.pattern_suggestions(created_at DESC);

-- Enable RLS
ALTER TABLE public.extraction_ground_truth ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pattern_suggestions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for extraction_ground_truth
CREATE POLICY "Admins can manage extraction ground truth"
  ON public.extraction_ground_truth
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can insert ground truth"
  ON public.extraction_ground_truth
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- RLS Policies for pattern_suggestions
CREATE POLICY "Admins can manage pattern suggestions"
  ON public.pattern_suggestions
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage pattern suggestions"
  ON public.pattern_suggestions
  FOR ALL
  USING (auth.role() = 'service_role');
