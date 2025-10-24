-- Add OCR error tracking columns to instagram_posts
ALTER TABLE instagram_posts 
ADD COLUMN IF NOT EXISTS ocr_error_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS ocr_last_error text,
ADD COLUMN IF NOT EXISTS ocr_last_attempt_at timestamptz;

-- Create post rejections table for learning
CREATE TABLE IF NOT EXISTS post_rejections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES instagram_posts(id) ON DELETE CASCADE,
  rejected_by uuid REFERENCES auth.users(id),
  rejection_reason text NOT NULL, -- 'not_event', 'duplicate', 'spam', 'bad_extraction'
  field_issues jsonb, -- Which fields were wrong: {"date": "incorrect", "venue": "incorrect"}
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on post_rejections
ALTER TABLE post_rejections ENABLE ROW LEVEL SECURITY;

-- Create policies for post_rejections
CREATE POLICY "Admins can manage post rejections"
  ON post_rejections
  FOR ALL
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can view post rejections"
  ON post_rejections
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'));

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_post_rejections_post ON post_rejections(post_id);
CREATE INDEX IF NOT EXISTS idx_post_rejections_reason ON post_rejections(rejection_reason);
CREATE INDEX IF NOT EXISTS idx_instagram_posts_ocr_status ON instagram_posts(ocr_processed, ocr_error_count);
CREATE INDEX IF NOT EXISTS idx_instagram_posts_review_status ON instagram_posts(needs_review, is_event);