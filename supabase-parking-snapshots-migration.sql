-- Migration: Create parking_snapshots table for historical trend tracking
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS parking_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL,
  property TEXT NOT NULL,
  total_spots INTEGER NOT NULL DEFAULT 0,
  occupied_spots INTEGER NOT NULL DEFAULT 0,
  vacant_spots INTEGER NOT NULL DEFAULT 0,
  notice_spots INTEGER NOT NULL DEFAULT 0,
  occupancy_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
  indoor_total INTEGER NOT NULL DEFAULT 0,
  indoor_vacant INTEGER NOT NULL DEFAULT 0,
  outdoor_total INTEGER NOT NULL DEFAULT 0,
  outdoor_vacant INTEGER NOT NULL DEFAULT 0,
  waitlist_first_spot INTEGER NOT NULL DEFAULT 0,
  waitlist_indoor_upgrade INTEGER NOT NULL DEFAULT 0,
  waitlist_second_spot INTEGER NOT NULL DEFAULT 0,
  waitlist_total INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure only one snapshot per property per day
  UNIQUE(snapshot_date, property)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_parking_snapshots_date ON parking_snapshots(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_parking_snapshots_property ON parking_snapshots(property);

-- Enable RLS
ALTER TABLE parking_snapshots ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to read snapshots
CREATE POLICY "Allow authenticated users to read snapshots"
  ON parking_snapshots
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Allow authenticated users to insert snapshots
CREATE POLICY "Allow authenticated users to insert snapshots"
  ON parking_snapshots
  FOR INSERT
  TO authenticated
  WITH CHECK (true);
