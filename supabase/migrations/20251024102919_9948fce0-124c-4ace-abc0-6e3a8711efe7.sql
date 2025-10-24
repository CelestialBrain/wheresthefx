-- Grant admin role to the specified user
DO $$
DECLARE
  target_user_id uuid;
BEGIN
  -- Get the user ID for the email
  SELECT id INTO target_user_id 
  FROM auth.users 
  WHERE email = 'marangelonrevelo@gmail.com';
  
  -- Only proceed if user exists
  IF target_user_id IS NOT NULL THEN
    -- Insert admin role if not already present
    INSERT INTO public.user_roles (user_id, role)
    VALUES (target_user_id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END $$;

-- Fix RLS policies for instagram_posts to allow authenticated users to manage review queue
DROP POLICY IF EXISTS "Authenticated users can update posts in review" ON instagram_posts;
DROP POLICY IF EXISTS "Authenticated users can delete posts in review" ON instagram_posts;

CREATE POLICY "Authenticated users can update posts in review"
  ON instagram_posts FOR UPDATE
  TO authenticated
  USING (needs_review = true)
  WITH CHECK (needs_review = true OR (is_event = true AND needs_review = true));

CREATE POLICY "Authenticated users can delete posts in review"
  ON instagram_posts FOR DELETE
  TO authenticated
  USING (needs_review = true OR is_event = true);