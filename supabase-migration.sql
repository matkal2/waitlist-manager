-- Supabase Migration: Create waitlist_entries table
-- Run this SQL in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS waitlist_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  entry_type TEXT NOT NULL CHECK (entry_type IN ('Internal Transfer', 'Prospect')),
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Contacted', 'Leased', 'Closed')),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  assigned_agent TEXT,
  unit_type_pref TEXT NOT NULL,
  floor_pref TEXT NOT NULL CHECK (floor_pref IN ('Ground', 'Middle', 'Top', 'No Preference')),
  max_budget NUMERIC NOT NULL,
  move_in_date DATE NOT NULL,
  current_unit_number TEXT,
  internal_notes TEXT
);

-- Create indexes for common queries
CREATE INDEX idx_waitlist_entry_type ON waitlist_entries(entry_type);
CREATE INDEX idx_waitlist_status ON waitlist_entries(status);
CREATE INDEX idx_waitlist_assigned_agent ON waitlist_entries(assigned_agent);
CREATE INDEX idx_waitlist_unit_type_pref ON waitlist_entries(unit_type_pref);

-- Enable Row Level Security (optional - adjust based on your auth needs)
ALTER TABLE waitlist_entries ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows all operations for now (adjust for production)
CREATE POLICY "Allow all operations" ON waitlist_entries
  FOR ALL
  USING (true)
  WITH CHECK (true);
