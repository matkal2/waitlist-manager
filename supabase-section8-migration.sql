-- Add is_section_8 column to waitlist_entries table
-- Run this in Supabase SQL Editor before deploying the new version

ALTER TABLE waitlist_entries 
ADD COLUMN IF NOT EXISTS is_section_8 BOOLEAN DEFAULT false;

-- Update existing entries to have is_section_8 = false
UPDATE waitlist_entries 
SET is_section_8 = false 
WHERE is_section_8 IS NULL;
