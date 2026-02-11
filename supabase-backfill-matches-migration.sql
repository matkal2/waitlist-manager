-- Backfill matched_at from notified_matches table
-- This updates waitlist_entries with the first match notification date for each entry

-- The notified_matches table has entry_ids as TEXT[] array

-- Update matched_at for entries that appear in notified_matches
UPDATE waitlist_entries we
SET 
  matched_at = subq.first_notified_at,
  outcome_status = CASE 
    WHEN we.outcome_status IS NULL OR we.outcome_status = 'active' THEN 'matched'
    ELSE we.outcome_status
  END
FROM (
  SELECT 
    entry_id::uuid as entry_id,
    MIN(nm.notified_at) as first_notified_at
  FROM notified_matches nm,
       UNNEST(nm.entry_ids) as entry_id
  GROUP BY entry_id::uuid
) subq
WHERE we.id = subq.entry_id
  AND we.matched_at IS NULL;

-- Verify the update
SELECT 
  'Entries updated with matched_at' as description,
  COUNT(*) as count
FROM waitlist_entries 
WHERE matched_at IS NOT NULL;
