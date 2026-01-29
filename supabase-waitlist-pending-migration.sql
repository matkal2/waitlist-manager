-- Migration: Create waitlist_pending_verifications table
-- Run this in your Supabase SQL Editor

-- Table to store pending waitlist submissions awaiting email verification
CREATE TABLE IF NOT EXISTS waitlist_pending_verifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Prospect information (same as waitlist_entries)
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,  -- Optional
  property TEXT NOT NULL,
  unit_type_pref TEXT NOT NULL,
  floor_pref TEXT DEFAULT 'No Preference',
  max_budget INTEGER,
  move_in_date DATE NOT NULL,
  move_in_date_end DATE,
  notes TEXT,
  
  -- Verification fields
  verification_code TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Index for faster lookups by email
CREATE INDEX IF NOT EXISTS idx_pending_verifications_email ON waitlist_pending_verifications(email);

-- Index for cleanup of expired entries
CREATE INDEX IF NOT EXISTS idx_pending_verifications_expires ON waitlist_pending_verifications(expires_at);

-- Enable Row Level Security
ALTER TABLE waitlist_pending_verifications ENABLE ROW LEVEL SECURITY;

-- Policy: Allow anonymous inserts (for public form)
CREATE POLICY "Allow anonymous insert" ON waitlist_pending_verifications
  FOR INSERT
  WITH CHECK (true);

-- Policy: Allow anonymous select (for verification)
CREATE POLICY "Allow anonymous select" ON waitlist_pending_verifications
  FOR SELECT
  USING (true);

-- Policy: Allow anonymous update (for resending code)
CREATE POLICY "Allow anonymous update" ON waitlist_pending_verifications
  FOR UPDATE
  USING (true);

-- Policy: Allow anonymous delete (after verification)
CREATE POLICY "Allow anonymous delete" ON waitlist_pending_verifications
  FOR DELETE
  USING (true);

-- Optional: Create a function to clean up expired verifications (run periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_verifications()
RETURNS void AS $$
BEGIN
  DELETE FROM waitlist_pending_verifications
  WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- You can schedule this cleanup with pg_cron if available, or run it manually
-- SELECT cleanup_expired_verifications();

COMMENT ON TABLE waitlist_pending_verifications IS 'Temporary storage for waitlist submissions pending email verification';
