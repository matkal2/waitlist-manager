import { authorize } from '@/lib/api-auth';
import { permissions } from '@/lib/permissions';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { normalizeReportProperty, toReportRecord, type ReportRecord } from '@/lib/waitlist-report-history';
import type { WaitlistEntry } from '@/types/database';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Returns report records for current, archived, and permanently deleted entries; the client aggregates by period/property
export async function GET(request: Request) {
  const caller = await authorize(request, permissions.canAccessWaitlist);
  if (caller instanceof NextResponse) return caller;

  try {
    const { data: entries, error } = await supabase.from('waitlist_entries').select('*');
    if (error) {
      console.error('Error fetching entries:', error);
      return NextResponse.json({ error: 'Failed to fetch entries' }, { status: 500 });
    }

    const { data: history, error: historyError } = await supabase.from('waitlist_report_history').select('*');
    if (historyError) console.error('Error fetching report history:', historyError);

    const current = (entries || []) as WaitlistEntry[];
    const currentIds = new Set(current.map(e => e.id));
    const deleted = ((history || []) as ReportRecord[])
      .filter(r => !currentIds.has(r.id))
      .map(r => ({ ...r, property: normalizeReportProperty(r.property) }));

    return NextResponse.json({
      success: true,
      records: [...current.map(toReportRecord), ...deleted],
      archivedCount: current.filter(e => e.archived_at).length,
      deletedCount: deleted.length,
    });
  } catch (error) {
    console.error('Error in reports:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
