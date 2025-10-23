-- Create a temporary table to force complete types regeneration
CREATE TABLE IF NOT EXISTS public._types_refresh_trigger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now()
);

-- Drop it immediately
DROP TABLE IF EXISTS public._types_refresh_trigger;