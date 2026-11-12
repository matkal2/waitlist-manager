import { createClient } from '@supabase/supabase-js';
import { getArchiveDate, getPurgeDate } from '@/lib/waitlist-retention';
import { toReportRecord } from '@/lib/waitlist-report-history';
import type { WaitlistEntry } from '@/types/database';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export interface CleanupResult {
  archived: string[];
  purged: string[];
}

// Archives expired prospects and permanently deletes entries archived 6+ months ago
export async function runWaitlistCleanup(now = new Date()): Promise<CleanupResult> {
  const { data, error } = await supabase.from('waitlist_entries').select('*');
  if (error) throw error;
  const entries = (data || []) as WaitlistEntry[];

  const toArchive = entries.filter(entry => {
    if (entry.archived_at) return false;
    const archiveDate = getArchiveDate(entry);
    return !!archiveDate && archiveDate <= now;
  });
  const toPurge = entries.filter(entry => entry.archived_at && getPurgeDate(entry.archived_at) <= now);

  if (toArchive.length > 0) {
    const archivedAt = now.toISOString();
    const { error: archiveError } = await supabase
      .from('waitlist_entries')
      .update({ archived_at: archivedAt })
      .in('id', toArchive.map(entry => entry.id));
    if (archiveError) throw archiveError;

    const { error: logError } = await supabase.from('activity_log').insert(
      toArchive.map(entry => ({
        action_type: 'archive',
        entry_id: entry.id,
        entry_data: entry,
        changed_by: 'System (Auto-archive)',
        changes: { archived_at: { old: null, new: archivedAt } },
      }))
    );
    if (logError) console.error('Failed to log archived entries:', logError);
  }

  if (toPurge.length > 0) {
    const { error: historyError } = await supabase
      .from('waitlist_report_history')
      .upsert(toPurge.map(toReportRecord));
    if (historyError) throw historyError;

    const { error: purgeError } = await supabase
      .from('waitlist_entries')
      .delete()
      .in('id', toPurge.map(entry => entry.id));
    if (purgeError) throw purgeError;

    const { error: logError } = await supabase.from('activity_log').insert(
      toPurge.map(entry => ({
        action_type: 'delete',
        entry_id: entry.id,
        entry_data: entry,
        changed_by: 'System (Archived 6+ months)',
        changes: null,
      }))
    );
    if (logError) console.error('Failed to log purged entries:', logError);
  }

  return {
    archived: toArchive.map(entry => entry.full_name),
    purged: toPurge.map(entry => entry.full_name),
  };
}
