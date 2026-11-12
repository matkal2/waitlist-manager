-- Keeps report history (no names or contact info) for waitlist entries after they are
-- permanently deleted from the archive, so Reports totals stay accurate.
CREATE TABLE IF NOT EXISTS waitlist_report_history (
  id UUID PRIMARY KEY,
  entry_type TEXT,
  property TEXT,
  assigned_agent TEXT,
  entry_source TEXT,
  outcome_status TEXT,
  created_at TIMESTAMPTZ,
  matched_at TIMESTAMPTZ,
  tour_scheduled_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ,
  lease_signed_at TIMESTAMPTZ,
  purged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only the server (service role) reads and writes this table
ALTER TABLE waitlist_report_history ENABLE ROW LEVEL SECURITY;
