-- Force types regeneration with a structural change
ALTER TABLE public.instagram_accounts ADD COLUMN IF NOT EXISTS temp_trigger_column text DEFAULT NULL;
ALTER TABLE public.instagram_accounts DROP COLUMN IF EXISTS temp_trigger_column;