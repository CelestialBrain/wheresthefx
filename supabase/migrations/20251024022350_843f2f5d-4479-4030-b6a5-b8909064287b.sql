-- Enable pg_trgm extension for fuzzy matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create location_corrections table for learning from manual corrections
CREATE TABLE location_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Original OCR/parsed data
  original_location_name TEXT,
  original_location_address TEXT,
  original_ocr_text TEXT,
  
  -- Manual corrections
  corrected_venue_name TEXT NOT NULL,
  corrected_street_address TEXT,
  manual_lat NUMERIC,
  manual_lng NUMERIC,
  
  -- Matching metadata
  match_pattern TEXT,
  correction_count INTEGER DEFAULT 1,
  confidence_score NUMERIC DEFAULT 1.0,
  
  -- Admin who made the correction
  corrected_by UUID REFERENCES auth.users(id),
  
  -- Applied to which event
  applied_to_event_id UUID REFERENCES events_enriched(id)
);

-- Create indexes for fast lookups
CREATE INDEX idx_location_corrections_venue ON location_corrections(corrected_venue_name);
CREATE INDEX idx_location_corrections_address ON location_corrections(corrected_street_address);
CREATE INDEX idx_location_corrections_pattern ON location_corrections(match_pattern);
CREATE INDEX idx_location_corrections_venue_trgm ON location_corrections USING gin(corrected_venue_name gin_trgm_ops);
CREATE INDEX idx_location_corrections_address_trgm ON location_corrections USING gin(corrected_street_address gin_trgm_ops);

-- Add trigger to update updated_at
CREATE TRIGGER update_location_corrections_updated_at
  BEFORE UPDATE ON location_corrections
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Update locations table to track manual overrides
ALTER TABLE locations 
ADD COLUMN IF NOT EXISTS manual_override BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS correction_id UUID REFERENCES location_corrections(id);

-- RLS policies for location_corrections
ALTER TABLE location_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage location corrections"
  ON location_corrections
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can view location corrections"
  ON location_corrections
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));