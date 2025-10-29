-- Delete all old patterns
DELETE FROM extraction_patterns;

-- Insert new patterns based on extractionUtils.ts

-- PRICE PATTERNS
INSERT INTO extraction_patterns (pattern_type, pattern_regex, pattern_description, confidence_score, source, is_active) VALUES
('price', '\\b(?:₱|PHP|P)\\s*(\\d{1,3}(?:[,\\s]\\d{3})*(?:\\.\\d{2})?)\\s*([kKmM])?\\b', 'Philippine peso with optional k/m suffix', 0.95, 'default', true),
('price', '\\b(?:₱|PHP|P)\\s*(\\d{1,3}(?:[,\\s]\\d{3})*(?:\\.\\d{2})?)\\s*(?:-|–|to|hanggang)\\s*(?:₱|PHP|P)?\\s*(\\d{1,3}(?:[,\\s]\\d{3})*(?:\\.\\d{2})?)\\s*([kKmM])?\\b', 'PHP price range', 0.90, 'default', true),
('price', '\\b(free|complimentary|walang\\s*bayad|libre|free\\s*admission|free\\s*entrance)\\b', 'Free event keywords', 0.95, 'default', true);

-- TIME PATTERNS
INSERT INTO extraction_patterns (pattern_type, pattern_regex, pattern_description, confidence_score, source, is_active) VALUES
('time', 'alas[-\\s]?(\\d{1,2})(?::(\\d{2}))?\\s*(?:ng\\s*)?(umaga|tanghali|hapon|gabi)?', 'Filipino alas- time format', 0.90, 'default', true),
('time', '\\b([01]?\\d|2[0-3])h([0-5]\\d)\\b', 'European 19h30 format', 0.85, 'default', true),
('time', '\\b(\\d{1,2})(?::([0-5]\\d))?\\s*(am|pm)?\\s*(?:[-–]|to|hanggang)?\\s*(\\d{1,2})?(?::([0-5]\\d))?\\s*(am|pm)?\\b', 'Standard time with optional range', 0.90, 'default', true);

-- DATE PATTERNS  
INSERT INTO extraction_patterns (pattern_type, pattern_regex, pattern_description, confidence_score, source, is_active) VALUES
('date', '\\b(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december|enero|pebrero|marso|abril|mayo|hunyo|hulyo|agosto|setyembre|oktubre|nobyembre|disyembre)\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:[-–]|to|hanggang)?\\s*(\\d{1,2})?(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?\\b', 'English/Filipino month + day with optional range', 0.95, 'default', true),
('date', 'ika-?\\s*(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:ng\\s+)?(enero|pebrero|marso|abril|mayo|hunyo|hulyo|agosto|setyembre|oktubre|nobyembre|disyembre)\\s*,?\\s*(\\d{4})?', 'Filipino ordinal date (ika-5 ng Mayo)', 0.90, 'default', true),
('date', '\\b(\\d{4})-(\\d{2})-(\\d{2})\\b', 'ISO date format YYYY-MM-DD', 0.95, 'default', true);

-- VENUE PATTERNS
INSERT INTO extraction_patterns (pattern_type, pattern_regex, pattern_description, confidence_score, source, is_active) VALUES
('venue', '📍\\s*([^\\n,]+?)(?:,\\s*([^\\n]+?))?(?=\\n|$|[📍🗓️⏰🎟️])', 'Pin emoji venue (highest priority)', 0.98, 'default', true),
('venue', '\\b(?:venue|location|where|saan|lugar)\\s*[:\\-]?\\s*([^,\\n.;#@]+?)(?=\\n|$|when|kailan|time|date)', 'Venue/location keywords', 0.85, 'default', true),
('venue', '\\b(?:at|@)\\s+(?![\\w.]+\\s*$)([A-Z][^\\n,@#]{2,}?)(?=\\n|$|when|time|date|@)', 'at/@ patterns (not Instagram handles)', 0.80, 'default', true);

-- SIGNUP URL PATTERNS
INSERT INTO extraction_patterns (pattern_type, pattern_regex, pattern_description, confidence_score, source, is_active) VALUES
('signup_url', 'https?://[^\\s"''<>)\\]]+', 'Generic HTTP/HTTPS URLs', 0.85, 'default', true),
('signup_url', '\\b(register|signup|sign up|tickets?|reserve|rsvp|book now|get tickets?)\\b[^https]*?(https?://[^\\s"''<>)\\]]+)', 'URLs near signup keywords', 0.95, 'default', true);