-- Create comprehensive scraper logs table
CREATE TABLE IF NOT EXISTS scraper_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  run_id UUID REFERENCES scrape_runs(id) ON DELETE CASCADE,
  post_id TEXT,
  instagram_post_id UUID REFERENCES instagram_posts(id) ON DELETE SET NULL,
  log_level TEXT NOT NULL CHECK (log_level IN ('info', 'warn', 'error', 'debug', 'success')),
  stage TEXT NOT NULL, -- 'fetch', 'ocr', 'parse', 'extraction', 'validation', 'save'
  message TEXT NOT NULL,
  data JSONB,
  duration_ms INTEGER,
  error_details JSONB
);

-- Enable RLS
ALTER TABLE scraper_logs ENABLE ROW LEVEL SECURITY;

-- Admins can view all logs
CREATE POLICY "Admins can view scraper logs"
  ON scraper_logs FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Service role can insert logs
CREATE POLICY "Service role can insert scraper logs"
  ON scraper_logs FOR INSERT
  WITH CHECK (true);

-- Add index for performance
CREATE INDEX idx_scraper_logs_run_id ON scraper_logs(run_id);
CREATE INDEX idx_scraper_logs_created_at ON scraper_logs(created_at DESC);
CREATE INDEX idx_scraper_logs_post_id ON scraper_logs(post_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE scraper_logs;