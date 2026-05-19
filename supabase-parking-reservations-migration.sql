-- =============================================================================
-- PARKING RESERVATIONS TABLE
-- Stores spot reservations for applicants who haven't signed leases yet
-- =============================================================================

CREATE TABLE IF NOT EXISTS parking_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Spot information
  property TEXT NOT NULL,
  spot_number TEXT NOT NULL,
  full_space_code TEXT NOT NULL,
  spot_type TEXT NOT NULL DEFAULT 'Indoor',
  monthly_rent NUMERIC DEFAULT 0,
  
  -- Applicant information (no tenant code yet)
  applicant_name TEXT NOT NULL,
  unit_number TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  
  -- Reservation details
  expected_move_in DATE,
  reservation_date DATE DEFAULT CURRENT_DATE,
  expiration_date DATE,
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'converted', 'cancelled', 'expired')),
  
  -- Conversion tracking (when applicant becomes tenant)
  converted_at TIMESTAMP WITH TIME ZONE,
  converted_tenant_code TEXT,
  
  -- Metadata
  reserved_by TEXT,
  notes TEXT,
  
  -- Ensure one active reservation per spot
  CONSTRAINT unique_active_spot_reservation UNIQUE (full_space_code, status) 
    WHERE status = 'active'
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_parking_reservations_property ON parking_reservations(property);
CREATE INDEX IF NOT EXISTS idx_parking_reservations_status ON parking_reservations(status);
CREATE INDEX IF NOT EXISTS idx_parking_reservations_unit ON parking_reservations(unit_number);
CREATE INDEX IF NOT EXISTS idx_parking_reservations_spot ON parking_reservations(full_space_code);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_parking_reservations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS parking_reservations_updated_at ON parking_reservations;
CREATE TRIGGER parking_reservations_updated_at
  BEFORE UPDATE ON parking_reservations
  FOR EACH ROW
  EXECUTE FUNCTION update_parking_reservations_updated_at();

-- Enable RLS
ALTER TABLE parking_reservations ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all operations for authenticated users
CREATE POLICY "Allow all for authenticated users" ON parking_reservations
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Policy: Allow read for anon (for public API access if needed)
CREATE POLICY "Allow read for anon" ON parking_reservations
  FOR SELECT
  TO anon
  USING (true);

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE parking_reservations IS 'Stores parking spot reservations for applicants in screening who have not yet signed a lease';
COMMENT ON COLUMN parking_reservations.status IS 'active: spot is reserved, converted: applicant signed lease and spot was assigned, cancelled: reservation was manually cancelled, expired: reservation passed expiration date';
COMMENT ON COLUMN parking_reservations.full_space_code IS 'Unique identifier matching the Google Sheet format (e.g., "Vista 8")';
