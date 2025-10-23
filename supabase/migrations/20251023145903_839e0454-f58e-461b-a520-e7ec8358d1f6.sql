-- Drop the admin-only policy
DROP POLICY IF EXISTS "Admins can manage Instagram accounts" ON instagram_accounts;

-- Allow anyone to insert Instagram accounts (temporary for development)
CREATE POLICY "Anyone can add Instagram accounts (temp)" ON instagram_accounts
  FOR INSERT
  WITH CHECK (true);

-- Allow anyone to update Instagram accounts (temporary for development)
CREATE POLICY "Anyone can update Instagram accounts (temp)" ON instagram_accounts
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Allow anyone to delete Instagram accounts (temporary for development)
CREATE POLICY "Anyone can delete Instagram accounts (temp)" ON instagram_accounts
  FOR DELETE
  USING (true);