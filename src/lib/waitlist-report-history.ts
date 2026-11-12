import type { WaitlistEntry } from '@/types/database';

export type ReportSource = 'self' | 'agent';

// Report fields only (no names or contact info); also the shape stored in waitlist_report_history
export interface ReportRecord {
  id: string;
  entry_type: string | null;
  property: string | null;
  assigned_agent: string | null;
  entry_source: ReportSource;
  outcome_status: string | null;
  created_at: string | null;
  matched_at: string | null;
  tour_scheduled_at: string | null;
  applied_at: string | null;
  lease_signed_at: string | null;
}

const PROPERTY_ALIASES: Record<string, string> = {
  'N. Clark': 'North Clark',
  'N Clark': 'North Clark',
  'W Montrose': 'W. Montrose',
  '246 Green Bay': 'Green Bay 246',
  '440 Green Bay': 'Green Bay 440',
  '546 Green Bay': 'Green Bay 546',
};

export function normalizeReportProperty(property: string | null): string | null {
  if (!property) return property;
  return PROPERTY_ALIASES[property] || property;
}

// Older self sign-ups were only marked in internal_notes
export function isSelfAdded(entry: { entry_source?: string | null; internal_notes?: string | null }): boolean {
  if (entry.entry_source === 'self') return true;
  const notes = entry.internal_notes?.toLowerCase() || '';
  return notes.includes('self-registered') || notes.includes('self registered') || notes.includes('public form');
}

export function toReportRecord(entry: WaitlistEntry): ReportRecord {
  return {
    id: entry.id,
    entry_type: entry.entry_type,
    property: normalizeReportProperty(entry.property),
    assigned_agent: entry.assigned_agent,
    entry_source: isSelfAdded(entry) ? 'self' : 'agent',
    outcome_status: entry.outcome_status ?? null,
    created_at: entry.created_at,
    matched_at: entry.matched_at ?? null,
    tour_scheduled_at: entry.tour_scheduled_at ?? null,
    applied_at: entry.applied_at ?? null,
    lease_signed_at: entry.lease_signed_at ?? null,
  };
}
