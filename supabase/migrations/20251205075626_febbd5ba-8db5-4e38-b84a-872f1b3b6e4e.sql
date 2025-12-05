-- Add last_heartbeat column to scrape_runs table
ALTER TABLE public.scrape_runs 
ADD COLUMN IF NOT EXISTS last_heartbeat timestamp with time zone DEFAULT now();

-- Add comment explaining the column
COMMENT ON COLUMN public.scrape_runs.last_heartbeat IS 'Updated every 30 seconds during scraping to detect stuck runs';

-- Create index for efficient cleanup queries
CREATE INDEX IF NOT EXISTS idx_scrape_runs_heartbeat ON public.scrape_runs (status, last_heartbeat) 
WHERE status = 'running';