-- =====================================================
-- STEP 1: Run this FIRST to create all tables
-- =====================================================

-- Add move_in_date_end column to waitlist_entries
ALTER TABLE waitlist_entries ADD COLUMN IF NOT EXISTS move_in_date_end DATE;

-- Create activity_log table for tracking edits and deletions
CREATE TABLE IF NOT EXISTS activity_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  action_type TEXT NOT NULL,
  entry_id UUID,
  entry_data JSONB NOT NULL,
  changed_by TEXT,
  changes JSONB
);

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON activity_log;
CREATE POLICY "Allow all operations for authenticated users" ON activity_log
  FOR ALL USING (true) WITH CHECK (true);

-- Create user_profiles table
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  is_admin BOOLEAN DEFAULT FALSE
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow users to read profiles" ON user_profiles;
DROP POLICY IF EXISTS "Allow users to update own profile" ON user_profiles;
DROP POLICY IF EXISTS "Allow inserts for registration" ON user_profiles;
DROP POLICY IF EXISTS "Allow all on user_profiles" ON user_profiles;
CREATE POLICY "Allow all on user_profiles" ON user_profiles FOR ALL USING (true) WITH CHECK (true);

-- Create user_invites table
CREATE TABLE IF NOT EXISTS user_invites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used BOOLEAN DEFAULT FALSE
);

ALTER TABLE user_invites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations on invites" ON user_invites;
CREATE POLICY "Allow all operations on invites" ON user_invites
  FOR ALL USING (true) WITH CHECK (true);

-- =====================================================
-- STEP 2: Run this AFTER Step 1 to add existing users
-- =====================================================

-- Add Matthew Kaleb (admin)
INSERT INTO user_profiles (id, email, full_name, is_admin, created_at)
SELECT id, email, 'Matthew Kaleb', true, created_at
FROM auth.users WHERE email = 'matthew.kaleb1763@gmail.com'
ON CONFLICT (email) DO UPDATE SET full_name = 'Matthew Kaleb', is_admin = true;

-- Add Michael Dillon (if account exists)
INSERT INTO user_profiles (id, email, full_name, is_admin, created_at)
SELECT id, email, 'Michael Dillon', false, created_at
FROM auth.users WHERE email = 'mdillon@hpvgproperties.com'
ON CONFLICT (email) DO UPDATE SET full_name = 'Michael Dillon';

-- =====================================================
-- STEP 3: Create notified_matches table for auto-notify
-- =====================================================

CREATE TABLE IF NOT EXISTS notified_matches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  match_key TEXT NOT NULL UNIQUE,
  agent TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  entry_ids TEXT[] NOT NULL,
  notified_at TIMESTAMP WITH TIME ZONE NOT NULL
);

ALTER TABLE notified_matches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on notified_matches" ON notified_matches;
CREATE POLICY "Allow all on notified_matches" ON notified_matches FOR ALL USING (true) WITH CHECK (true);

-- =====================================================
-- STEP 4: Fix status column constraint
-- Run this if status changes are failing
-- =====================================================

ALTER TABLE waitlist_entries DROP CONSTRAINT IF EXISTS waitlist_entries_status_check;

ALTER TABLE waitlist_entries ADD CONSTRAINT waitlist_entries_status_check 
CHECK (status IN ('Active', 'Showing Scheduled', 'Applied', 'Signed Lease', 'Inactive', 'Leased'));
