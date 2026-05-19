-- =====================================================
-- ROLE-BASED ACCESS CONTROL MIGRATION
-- Run this in Supabase SQL Editor
-- =====================================================

-- Step 1: Add role column to user_profiles
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'leasing_agent';

-- Step 2: Migrate existing data
-- Convert is_admin = true to 'admin', false to 'leasing_agent'
UPDATE user_profiles 
SET role = CASE 
  WHEN is_admin = true THEN 'admin'
  ELSE 'leasing_agent'
END
WHERE role IS NULL OR role = 'leasing_agent';

-- Step 3: Add check constraint to ensure valid roles
ALTER TABLE user_profiles 
DROP CONSTRAINT IF EXISTS valid_role;

ALTER TABLE user_profiles 
ADD CONSTRAINT valid_role 
CHECK (role IN ('admin', 'leasing_agent', 'property_manager'));

-- Step 4: Create index for role lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_role 
ON user_profiles(role);

-- =====================================================
-- VERIFICATION QUERIES (optional - run to verify)
-- =====================================================

-- View all users with their roles
-- SELECT email, full_name, role, is_admin FROM user_profiles;

-- Count users by role
-- SELECT role, COUNT(*) FROM user_profiles GROUP BY role;
