-- Add original_text column to store the raw text from captions (not normalized values)
ALTER TABLE extraction_ground_truth 
ADD COLUMN IF NOT EXISTS original_text TEXT;

-- Add comment explaining the column
COMMENT ON COLUMN extraction_ground_truth.original_text IS 'The raw text as it appeared in the caption/OCR, before normalization (e.g., "Dec 6" instead of "2025-12-06")';