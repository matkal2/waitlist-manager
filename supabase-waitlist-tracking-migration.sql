-- Waitlist Tracking Migration
-- Adds columns to track entry source and outcome funnel
-- Run this in Supabase SQL Editor

-- Add entry_source column to distinguish self-added vs agent-added
ALTER TABLE waitlist_entries 
ADD COLUMN IF NOT EXISTS entry_source TEXT DEFAULT 'agent';

-- Add outcome tracking timestamps
ALTER TABLE waitlist_entries 
ADD COLUMN IF NOT EXISTS matched_at TIMESTAMPTZ;

ALTER TABLE waitlist_entries 
ADD COLUMN IF NOT EXISTS tour_scheduled_at TIMESTAMPTZ;

ALTER TABLE waitlist_entries 
ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ;

ALTER TABLE waitlist_entries 
ADD COLUMN IF NOT EXISTS lease_signed_at TIMESTAMPTZ;

-- Add outcome status for current funnel stage
-- Values: 'active', 'matched', 'touring', 'applied', 'leased', 'declined', 'removed'
ALTER TABLE waitlist_entries 
ADD COLUMN IF NOT EXISTS outcome_status TEXT DEFAULT 'active';

-- Add decline/removal reason (optional tracking)
ALTER TABLE waitlist_entries 
ADD COLUMN IF NOT EXISTS outcome_notes TEXT;

-- Backfill entry_source for existing entries based on internal_notes
UPDATE waitlist_entries 
SET entry_source = 'self' 
WHERE internal_notes LIKE '%[Self-registered]%' 
  AND (entry_source IS NULL OR entry_source = 'agent');

-- Create index for reporting queries
CREATE INDEX IF NOT EXISTS idx_waitlist_entries_created_at ON waitlist_entries(created_at);
CREATE INDEX IF NOT EXISTS idx_waitlist_entries_entry_source ON waitlist_entries(entry_source);
CREATE INDEX IF NOT EXISTS idx_waitlist_entries_outcome_status ON waitlist_entries(outcome_status);

-- Add comments for documentation
COMMENT ON COLUMN waitlist_entries.entry_source IS 'How entry was created: self (public form) or agent (staff added)';
COMMENT ON COLUMN waitlist_entries.matched_at IS 'Timestamp when entry was matched to an available unit';
COMMENT ON COLUMN waitlist_entries.tour_scheduled_at IS 'Timestamp when a tour was scheduled';
COMMENT ON COLUMN waitlist_entries.applied_at IS 'Timestamp when prospect submitted application';
COMMENT ON COLUMN waitlist_entries.lease_signed_at IS 'Timestamp when lease was signed';
COMMENT ON COLUMN waitlist_entries.outcome_status IS 'Current funnel stage: active, matched, touring, applied, leased, declined, removed';
COMMENT ON COLUMN waitlist_entries.outcome_notes IS 'Notes about outcome (e.g., decline reason)';
