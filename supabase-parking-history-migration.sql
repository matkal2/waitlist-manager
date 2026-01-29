-- Migration to add revert tracking to parking_changes table
-- Run this in Supabase SQL Editor

-- Add columns for revert tracking
ALTER TABLE parking_changes 
ADD COLUMN IF NOT EXISTS reverted boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS reverted_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS reverted_by text,
ADD COLUMN IF NOT EXISTS sheet_row_number integer;

-- Add index for faster queries on reverted status
CREATE INDEX IF NOT EXISTS idx_parking_changes_reverted ON parking_changes(reverted);

-- Add index for submission date queries
CREATE INDEX IF NOT EXISTS idx_parking_changes_submission_date ON parking_changes(submission_date DESC);
