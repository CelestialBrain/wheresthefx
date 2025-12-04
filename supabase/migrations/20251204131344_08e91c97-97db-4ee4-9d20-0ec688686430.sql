-- Fix search_path for update_account_venue_stats function
CREATE OR REPLACE FUNCTION public.update_account_venue_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process if location_name is set and is_event is true
  IF NEW.location_name IS NOT NULL AND NEW.is_event = true THEN
    INSERT INTO public.account_venue_stats (instagram_account_id, venue_name, post_count, last_used_at)
    VALUES (NEW.instagram_account_id, NEW.location_name, 1, NOW())
    ON CONFLICT (instagram_account_id, venue_name)
    DO UPDATE SET 
      post_count = account_venue_stats.post_count + 1,
      last_used_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;