-- Waitlist archive: expired prospects are archived instead of deleted,
-- then permanently deleted 6 months after archiving (see src/lib/waitlist-retention.ts)
ALTER TABLE waitlist_entries ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE waitlist_entries ADD COLUMN IF NOT EXISTS restored_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_waitlist_entries_archived_at ON waitlist_entries (archived_at);
