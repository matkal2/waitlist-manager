-- Parking Changes Table
-- Stores parking change requests before syncing to Google Sheets

CREATE TABLE IF NOT EXISTS parking_changes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type VARCHAR(50) NOT NULL, -- 'Termination', 'Add', 'Transfer', 'New Lease Signed'
  tenant_name VARCHAR(255) NOT NULL,
  tenant_unit VARCHAR(50) NOT NULL,
  tenant_code VARCHAR(50), -- Auto-populated from master sheet
  effective_date DATE NOT NULL,
  primary_space VARCHAR(100) NOT NULL,
  transfer_to_space VARCHAR(100), -- Only for Transfer type
  submitter VARCHAR(255) NOT NULL,
  other_notes TEXT,
  submission_date TIMESTAMPTZ DEFAULT NOW(),
  synced_to_sheet BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_parking_changes_submission_date ON parking_changes(submission_date DESC);
CREATE INDEX IF NOT EXISTS idx_parking_changes_type ON parking_changes(type);
CREATE INDEX IF NOT EXISTS idx_parking_changes_synced ON parking_changes(synced_to_sheet);

-- Enable Row Level Security
ALTER TABLE parking_changes ENABLE ROW LEVEL SECURITY;

-- Policy to allow all authenticated users to read
CREATE POLICY "Allow authenticated users to read parking_changes"
  ON parking_changes FOR SELECT
  TO authenticated
  USING (true);

-- Policy to allow all authenticated users to insert
CREATE POLICY "Allow authenticated users to insert parking_changes"
  ON parking_changes FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policy to allow all authenticated users to update
CREATE POLICY "Allow authenticated users to update parking_changes"
  ON parking_changes FOR UPDATE
  TO authenticated
  USING (true);
