-- Migration: Create properties table for admin-managed property list
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL UNIQUE,
  nickname TEXT NOT NULL,
  short_code TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_properties_active ON properties(is_active);
CREATE INDEX IF NOT EXISTS idx_properties_nickname ON properties(nickname);

-- Enable RLS
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to read properties
CREATE POLICY "Allow authenticated users to read properties"
  ON properties
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Allow authenticated users to insert properties (admin check in app)
CREATE POLICY "Allow authenticated users to insert properties"
  ON properties
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policy: Allow authenticated users to update properties (admin check in app)
CREATE POLICY "Allow authenticated users to update properties"
  ON properties
  FOR UPDATE
  TO authenticated
  USING (true);

-- Insert existing properties as seed data
INSERT INTO properties (full_name, nickname, short_code, is_active) VALUES
  ('HIGHPOINT Countryside Residences', 'Countryside C', 'CC', true),
  ('HIGHPOINT Countryside Townhomes', 'Countryside T', 'CT', true),
  ('HIGHPOINT Avondale', 'Elston', 'EL', true),
  ('HIGHPOINT Jefferson Park', 'Kennedy', 'KE', true),
  ('HIGHPOINT Lincoln Park on Clark', 'North Clark', 'NC', true),
  ('HIGHPOINT Clarendon Hills', 'Park', 'PK', true),
  ('HIGHPOINT Downers Grove on Rogers', 'Rogers', 'RO', true),
  ('HIGHPOINT Wicker Park', 'Talman', 'TA', true),
  ('HIGHPOINT Highwood Station 246', 'Green Bay 246', 'GB246', true),
  ('HIGHPOINT Highwood Station 440', 'Green Bay 440', 'GB440', true),
  ('HIGHPOINT Highwood Station 546', 'Green Bay 546', 'GB546', true),
  ('HIGHPOINT Wilmette', 'Greenleaf', 'GL', true),
  ('HIGHPOINT Barrington', 'Liberty', 'LI', true),
  ('HIGHPOINT Buena Park', 'Broadway', 'BR', true),
  ('HIGHPOINT Lincoln Park on Fullerton', 'Fullerton', 'FU', true),
  ('HIGHPOINT Albany Park on Kedzie', 'Kedzie', 'KD', true),
  ('HIGHPOINT Lakeview on Sheffield', 'Sheffield', 'SH', true),
  ('HIGHPOINT West Loop', 'Warren', 'WA', true),
  ('HIGHPOINT West Town', 'W. Chicago', 'WC', true),
  ('HIGHPOINT Albany Park on Montrose', 'W. Montrose', 'WM', true)
ON CONFLICT (full_name) DO NOTHING;
