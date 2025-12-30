-- Add move_in_date_end column to waitlist_entries
ALTER TABLE waitlist_entries ADD COLUMN IF NOT EXISTS move_in_date_end DATE;

-- Create activity_log table for tracking edits and deletions
CREATE TABLE IF NOT EXISTS activity_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  action_type TEXT NOT NULL, -- 'edit', 'delete', 'create'
  entry_id UUID,
  entry_data JSONB NOT NULL, -- snapshot of entry before change
  changed_by TEXT, -- email of user who made change
  changes JSONB -- for edits: what fields changed
);

-- Enable RLS for activity_log
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- Policy to allow all operations for authenticated users on activity_log
CREATE POLICY "Allow all operations for authenticated users" ON activity_log
  FOR ALL USING (true) WITH CHECK (true);

-- Create user_profiles table for storing user information
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  is_admin BOOLEAN DEFAULT FALSE
);

-- Enable RLS for user_profiles
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Policy to allow users to read all profiles
CREATE POLICY "Allow users to read profiles" ON user_profiles
  FOR SELECT USING (true);

-- Policy to allow users to update their own profile
CREATE POLICY "Allow users to update own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);

-- Policy to allow inserts (for registration)
CREATE POLICY "Allow inserts for registration" ON user_profiles
  FOR INSERT WITH CHECK (true);

-- Create user_invites table for admin invitations
CREATE TABLE IF NOT EXISTS user_invites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used BOOLEAN DEFAULT FALSE
);

-- Enable RLS for user_invites
ALTER TABLE user_invites ENABLE ROW LEVEL SECURITY;

-- Policy to allow all operations on invites (admin-managed)
CREATE POLICY "Allow all operations on invites" ON user_invites
  FOR ALL USING (true) WITH CHECK (true);

-- Auto-delete logs older than 6 months (run this as a cron job or scheduled function)
-- DELETE FROM activity_log WHERE created_at < NOW() - INTERVAL '6 months';
