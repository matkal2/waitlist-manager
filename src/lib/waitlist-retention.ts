import type { WaitlistEntry } from '@/types/database';

export const ARCHIVE_GRACE_MONTHS = 1;
export const EXTENDED_RETENTION_MONTHS = 12;
export const RESTORE_GRACE_DAYS = 30;
export const PURGE_AFTER_MONTHS = 6;

type RetentionFields = Pick<
  WaitlistEntry,
  'entry_type' | 'move_in_date' | 'move_in_date_end' | 'extended_retention' | 'restored_at'
>;

const addMonths = (date: Date, months: number) => {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
};

// Prospects are archived 1 month after their move-in window ends (12 with extended retention),
// and never sooner than 30 days after being restored. Internal Transfers are never archived.
export function getArchiveDate(entry: RetentionFields): Date | null {
  if (entry.entry_type !== 'Prospect') return null;
  const windowEnd = entry.move_in_date_end || entry.move_in_date;
  if (!windowEnd) return null;

  const [year, month, day] = windowEnd.split('-').map(Number);
  let archiveDate = addMonths(
    new Date(year, month - 1, day),
    entry.extended_retention ? EXTENDED_RETENTION_MONTHS : ARCHIVE_GRACE_MONTHS
  );

  if (entry.restored_at) {
    const restoreGrace = new Date(entry.restored_at);
    restoreGrace.setDate(restoreGrace.getDate() + RESTORE_GRACE_DAYS);
    if (restoreGrace > archiveDate) archiveDate = restoreGrace;
  }
  return archiveDate;
}

// Archived entries are permanently deleted 6 months after archiving
export function getPurgeDate(archivedAt: string): Date {
  return addMonths(new Date(archivedAt), PURGE_AFTER_MONTHS);
}
