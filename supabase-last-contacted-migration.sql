-- Migration: Add last_contacted and nurture_status columns to waitlist_entries
-- Run this in Supabase SQL Editor

-- Add last_contacted column (timestamp of when entry was last contacted)
ALTER TABLE waitlist_entries 
ADD COLUMN IF NOT EXISTS last_contacted TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add nurture_status column (tracking conversion funnel)
ALTER TABLE waitlist_entries 
ADD COLUMN IF NOT EXISTS nurture_status TEXT DEFAULT NULL
CHECK (nurture_status IN ('scheduled', 'applied', 'lease_signed', NULL));

-- Create index for filtering by nurture status
CREATE INDEX IF NOT EXISTS idx_waitlist_nurture_status ON waitlist_entries(nurture_status);

-- Create index for sorting by last contacted
CREATE INDEX IF NOT EXISTS idx_waitlist_last_contacted ON waitlist_entries(last_contacted);
