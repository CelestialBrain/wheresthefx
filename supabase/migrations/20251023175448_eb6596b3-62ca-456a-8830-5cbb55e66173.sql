-- Add preferences and onboarding to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}'::jsonb;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS has_completed_onboarding BOOLEAN DEFAULT false;

-- Create index for faster preference queries
CREATE INDEX IF NOT EXISTS idx_profiles_preferences ON profiles USING gin(preferences);

-- Create predefined interest tags table
CREATE TABLE IF NOT EXISTS interest_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  category text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on interest_tags
ALTER TABLE interest_tags ENABLE ROW LEVEL SECURITY;

-- RLS policy: Anyone can read interest tags
CREATE POLICY "Anyone can view interest tags"
  ON interest_tags
  FOR SELECT
  USING (true);

-- Insert predefined interest tags
INSERT INTO interest_tags (name, category) VALUES
  ('parties', 'nightlife'),
  ('concerts', 'music'),
  ('art shows', 'culture'),
  ('thrift markets', 'shopping'),
  ('food events', 'food'),
  ('sports', 'sports'),
  ('comedy shows', 'entertainment'),
  ('workshops', 'education'),
  ('networking', 'business'),
  ('festivals', 'culture'),
  ('nightlife', 'nightlife'),
  ('live music', 'music'),
  ('dance', 'entertainment'),
  ('theater', 'culture'),
  ('film screenings', 'entertainment')
ON CONFLICT (name) DO NOTHING;

-- Create view for most popular Instagram accounts
CREATE OR REPLACE VIEW popular_instagram_accounts AS
SELECT 
  ia.*,
  COUNT(ip.id) as post_count,
  COALESCE(SUM(ip.likes_count), 0) as total_likes,
  COALESCE(SUM(ip.comments_count), 0) as total_comments,
  (COALESCE(SUM(ip.likes_count), 0) + COALESCE(SUM(ip.comments_count), 0) * 2) as engagement_score
FROM instagram_accounts ia
LEFT JOIN instagram_posts ip ON ia.id = ip.instagram_account_id
WHERE ia.is_active = true
GROUP BY ia.id
ORDER BY engagement_score DESC;