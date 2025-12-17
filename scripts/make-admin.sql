-- Make user with email marangelonrevelo@gmail.com an admin
-- This script adds the 'admin' role to the user_roles table

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role
FROM auth.users
WHERE email = 'marangelonrevelo@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

-- Verify the role was added
SELECT
  u.email,
  u.id as user_id,
  ur.role,
  ur.created_at
FROM auth.users u
LEFT JOIN public.user_roles ur ON u.id = ur.user_id
WHERE u.email = 'marangelonrevelo@gmail.com';
