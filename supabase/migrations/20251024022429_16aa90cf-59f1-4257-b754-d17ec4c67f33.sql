-- Create function to find similar addresses using fuzzy matching
CREATE OR REPLACE FUNCTION find_similar_addresses(
  search_address TEXT,
  similarity_threshold FLOAT DEFAULT 0.5
)
RETURNS TABLE (
  id UUID,
  corrected_venue_name TEXT,
  corrected_street_address TEXT,
  manual_lat NUMERIC,
  manual_lng NUMERIC,
  correction_count INTEGER,
  confidence_score NUMERIC,
  similarity_score FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    lc.id,
    lc.corrected_venue_name,
    lc.corrected_street_address,
    lc.manual_lat,
    lc.manual_lng,
    lc.correction_count,
    lc.confidence_score,
    similarity(lc.corrected_street_address, search_address) as similarity_score
  FROM location_corrections lc
  WHERE lc.corrected_street_address IS NOT NULL
    AND similarity(lc.corrected_street_address, search_address) > similarity_threshold
  ORDER BY 
    similarity(lc.corrected_street_address, search_address) DESC,
    lc.confidence_score DESC,
    lc.correction_count DESC
  LIMIT 10;
END;
$$ LANGUAGE plpgsql;

-- Create function to find similar venues using fuzzy matching
CREATE OR REPLACE FUNCTION find_similar_venues(
  search_venue TEXT,
  similarity_threshold FLOAT DEFAULT 0.5
)
RETURNS TABLE (
  id UUID,
  corrected_venue_name TEXT,
  corrected_street_address TEXT,
  manual_lat NUMERIC,
  manual_lng NUMERIC,
  correction_count INTEGER,
  confidence_score NUMERIC,
  similarity_score FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    lc.id,
    lc.corrected_venue_name,
    lc.corrected_street_address,
    lc.manual_lat,
    lc.manual_lng,
    lc.correction_count,
    lc.confidence_score,
    similarity(lc.corrected_venue_name, search_venue) as similarity_score
  FROM location_corrections lc
  WHERE similarity(lc.corrected_venue_name, search_venue) > similarity_threshold
  ORDER BY 
    similarity(lc.corrected_venue_name, search_venue) DESC,
    lc.confidence_score DESC,
    lc.correction_count DESC
  LIMIT 10;
END;
$$ LANGUAGE plpgsql;