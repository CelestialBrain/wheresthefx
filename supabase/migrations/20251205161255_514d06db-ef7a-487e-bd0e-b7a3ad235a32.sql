-- Add github_actions_ingest to the scrape_run_type enum
ALTER TYPE scrape_run_type ADD VALUE IF NOT EXISTS 'github_actions_ingest';