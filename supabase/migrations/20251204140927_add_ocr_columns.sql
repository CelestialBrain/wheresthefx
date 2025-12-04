-- Add OCR extraction columns to instagram_posts table

-- Array of text lines extracted from image via OCR
ALTER TABLE public.instagram_posts 
ADD COLUMN IF NOT EXISTS ocr_text_extracted text[];

-- OCR confidence score (0.0 to 1.0)
ALTER TABLE public.instagram_posts 
ADD COLUMN IF NOT EXISTS ocr_confidence numeric;

-- Add index for finding posts that used OCR
CREATE INDEX IF NOT EXISTS idx_instagram_posts_ocr_extracted 
ON public.instagram_posts((ocr_text_extracted IS NOT NULL));

-- Update extraction_method to include new value (add comment for documentation)
COMMENT ON COLUMN public.instagram_posts.extraction_method IS 
'Extraction method used: regex, ai, ai_corrected, ocr_ai, ai_vision';

-- Add comments for new columns
COMMENT ON COLUMN public.instagram_posts.ocr_text_extracted IS 
'Array of text lines extracted from event poster image via OCR.space';

COMMENT ON COLUMN public.instagram_posts.ocr_confidence IS 
'OCR confidence score from 0.0 to 1.0 based on exit code';
