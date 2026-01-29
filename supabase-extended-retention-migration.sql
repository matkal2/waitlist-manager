-- Add extended_retention column to waitlist_entries
-- When true, entries are retained for 1 year after move-in date instead of 1 month

ALTER TABLE waitlist_entries 
ADD COLUMN IF NOT EXISTS extended_retention BOOLEAN DEFAULT false;
