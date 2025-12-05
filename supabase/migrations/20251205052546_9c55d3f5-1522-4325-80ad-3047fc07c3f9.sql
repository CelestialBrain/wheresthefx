-- Drop foreign keys that reference instagram_posts.id (UUID)
ALTER TABLE extraction_ground_truth DROP CONSTRAINT IF EXISTS extraction_ground_truth_post_id_fkey;
ALTER TABLE extraction_corrections DROP CONSTRAINT IF EXISTS extraction_corrections_post_id_fkey;
ALTER TABLE extraction_feedback DROP CONSTRAINT IF EXISTS extraction_feedback_post_id_fkey;

-- Change post_id from UUID to TEXT
ALTER TABLE extraction_ground_truth ALTER COLUMN post_id TYPE text USING post_id::text;
ALTER TABLE extraction_corrections ALTER COLUMN post_id TYPE text USING post_id::text;
ALTER TABLE extraction_feedback ALTER COLUMN post_id TYPE text USING post_id::text;

-- Add comment explaining this stores Instagram numeric post IDs, not DB UUIDs
COMMENT ON COLUMN extraction_ground_truth.post_id IS 'Instagram numeric post ID (string), not DB UUID';
COMMENT ON COLUMN extraction_corrections.post_id IS 'Instagram numeric post ID (string), not DB UUID';
COMMENT ON COLUMN extraction_feedback.post_id IS 'Instagram numeric post ID (string), not DB UUID';