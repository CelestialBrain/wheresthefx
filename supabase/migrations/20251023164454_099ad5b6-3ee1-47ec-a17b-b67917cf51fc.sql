-- Enable pg_cron extension for scheduling tasks
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable pg_net extension for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule cleanup function to run daily at 2 AM
SELECT cron.schedule(
  'cleanup-old-events-daily',
  '0 2 * * *', -- Run at 2:00 AM every day
  $$
  SELECT
    net.http_post(
      url:='https://ltgxvskqotbuclrinhej.supabase.co/functions/v1/cleanup-old-events',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0Z3h2c2txb3RidWNscmluaGVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEyMjY1NTMsImV4cCI6MjA3NjgwMjU1M30.94ibR92U_ekHBl0BN0w-2eVSGMfPmgEa23AjInBk1hU"}'::jsonb
    ) as request_id;
  $$
);
