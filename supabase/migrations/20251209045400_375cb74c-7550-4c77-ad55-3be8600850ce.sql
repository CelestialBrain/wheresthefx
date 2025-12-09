-- Add end_time column to event_dates table for time ranges per day
ALTER TABLE public.event_dates ADD COLUMN IF NOT EXISTS end_time time without time zone;