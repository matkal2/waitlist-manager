-- Add move_in_date_end column to waitlist_entries
ALTER TABLE waitlist_entries ADD COLUMN IF NOT EXISTS move_in_date_end DATE;

-- Create activity_log table for tracking edits and deletions
CREATE TABLE IF NOT EXISTS activity_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  action_type TEXT NOT NULL, -- 'edit', 'delete', 'create'
  entry_id UUID,
  entry_data JSONB NOT NULL, -- snapshot of entry before change
  changed_by TEXT, -- email of user who made change
  changes JSONB -- for edits: what fields changed
);

-- Enable RLS
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- Policy to allow all operations for authenticated users
CREATE POLICY "Allow all operations for authenticated users" ON activity_log
  FOR ALL USING (true) WITH CHECK (true);

-- Auto-delete logs older than 6 months (run this as a cron job or scheduled function)
-- DELETE FROM activity_log WHERE created_at < NOW() - INTERVAL '6 months';
