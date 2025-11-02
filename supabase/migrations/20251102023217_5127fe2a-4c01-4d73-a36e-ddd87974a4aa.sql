-- Enable realtime updates for saved_events table to sync across devices
ALTER PUBLICATION supabase_realtime ADD TABLE saved_events;