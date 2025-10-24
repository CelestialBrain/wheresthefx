-- Phase 1: Fix RLS policies for review queue workflow

-- Drop existing policies that are too restrictive
DROP POLICY IF EXISTS "Authenticated users can update posts in review" ON instagram_posts;
DROP POLICY IF EXISTS "Authenticated users can delete posts in review" ON instagram_posts;

-- Create improved UPDATE policy that allows:
-- 1. Updating posts that are currently in review (needs_review = true)
-- 2. Marking posts as rejected (setting needs_review = false, is_event = false)
-- 3. Keeping posts in review while updating them
CREATE POLICY "Authenticated users can update posts in review"
  ON instagram_posts FOR UPDATE
  TO authenticated
  USING (needs_review = true OR is_event = true)
  WITH CHECK (
    -- Allow updating review items
    needs_review = true OR 
    -- Allow rejecting items (setting needs_review = false, is_event = false)
    (needs_review = false AND is_event = false) OR
    -- Allow updates while staying in review
    (is_event = true AND needs_review = true)
  );

-- Create improved DELETE policy that allows deleting:
-- 1. Posts in review
-- 2. Event posts
-- 3. Rejected posts (is_event = false, needs_review = false)
CREATE POLICY "Authenticated users can delete posts"
  ON instagram_posts FOR DELETE
  TO authenticated
  USING (
    needs_review = true OR 
    is_event = true OR
    (is_event = false AND needs_review = false)
  );