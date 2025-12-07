-- Add missing columns to published_events table for complete event data
ALTER TABLE public.published_events 
ADD COLUMN IF NOT EXISTS price_min numeric,
ADD COLUMN IF NOT EXISTS price_max numeric,
ADD COLUMN IF NOT EXISTS price_notes text,
ADD COLUMN IF NOT EXISTS event_status text DEFAULT 'confirmed',
ADD COLUMN IF NOT EXISTS availability_status text DEFAULT 'available';