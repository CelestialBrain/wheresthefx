-- Create enum for scrape run types
CREATE TYPE scrape_run_type AS ENUM ('manual_dataset', 'manual_scrape', 'automated');

-- Create enum for scrape run status
CREATE TYPE scrape_run_status AS ENUM ('running', 'completed', 'failed');

-- Create scrape_runs table to track scraping history
CREATE TABLE public.scrape_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_type scrape_run_type NOT NULL,
  dataset_id TEXT,
  posts_added INTEGER NOT NULL DEFAULT 0,
  posts_updated INTEGER NOT NULL DEFAULT 0,
  accounts_found INTEGER NOT NULL DEFAULT 0,
  status scrape_run_status NOT NULL DEFAULT 'running',
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Update instagram_accounts follower_count to bigint (Instagram accounts can exceed 2.1B followers)
ALTER TABLE public.instagram_accounts 
  ALTER COLUMN follower_count TYPE BIGINT;

-- Enable RLS on scrape_runs
ALTER TABLE public.scrape_runs ENABLE ROW LEVEL SECURITY;

-- Allow admins to view all scrape runs
CREATE POLICY "Admins can view scrape runs"
  ON public.scrape_runs
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow edge functions to insert/update scrape runs (using service role)
CREATE POLICY "Service role can manage scrape runs"
  ON public.scrape_runs
  FOR ALL
  USING (true);

-- Create index for faster queries
CREATE INDEX idx_scrape_runs_started_at ON public.scrape_runs(started_at DESC);

-- Enable pg_cron extension for scheduled tasks
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable pg_net extension for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule daily Instagram scraping at 3 AM UTC+8 (which is 7 PM UTC previous day)
SELECT cron.schedule(
  'daily-instagram-scrape',
  '0 19 * * *', -- 7 PM UTC = 3 AM UTC+8
  $$
  SELECT
    net.http_post(
      url:='https://aweclomjvpudinuglgwu.supabase.co/functions/v1/scrape-instagram',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF3ZWNsb21qdnB1ZGludWdsZ3d1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEyMjQ5MTgsImV4cCI6MjA3NjgwMDkxOH0.MB19bukq1k3kzwyI2aNqSWBANII2qCDjlcfhR2t11Uo"}'::jsonb,
      body:='{"automated": true}'::jsonb
    ) as request_id;
  $$
);