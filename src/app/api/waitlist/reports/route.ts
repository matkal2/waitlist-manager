import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getYTDRange, getCurrentWeekRange, getRangeForQuery, formatDateRange } from '@/lib/date-utils';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface ReportMetrics {
  totalEntries: number;
  agentEntries: number;
  selfEntries: number;
  matchedCount: number;
  toursScheduled: number;
  applied: number;
  leaseSigned: number;
}

// Helper to check if entry is self-added (check both entry_source and internal_notes for backwards compatibility)
function isSelfAdded(entry: any): boolean {
  if (entry.entry_source === 'self') return true;
  // Case-insensitive check for various self-registered patterns
  const notes = entry.internal_notes?.toLowerCase() || '';
  if (notes.includes('self-registered') || notes.includes('self registered') || notes.includes('public form')) {
    return true;
  }
  return false;
}

function calculateMetrics(
  entries: any[], 
  range: { start: string; end: string },
  matchedEmails: Set<string>
): ReportMetrics {
  const startDate = new Date(range.start);
  const endDate = new Date(range.end);
  
  const inRange = (dateStr: string | null) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    return d >= startDate && d <= endDate;
  };
  
  // Filter entries created in this period
  const entriesInPeriod = entries.filter(e => inRange(e.created_at));
  
  // Count self vs agent entries using the helper
  const selfEntries = entriesInPeriod.filter(e => isSelfAdded(e)).length;
  const agentEntries = entriesInPeriod.length - selfEntries;
  
  // Count matches: entries whose email appears in notified_emails of any unit
  // OR entries with matched_at timestamp in this period
  const matchedInPeriod = entriesInPeriod.filter(e => 
    matchedEmails.has(e.email?.toLowerCase()) || inRange(e.matched_at)
  ).length;
  
  return {
    totalEntries: entriesInPeriod.length,
    agentEntries,
    selfEntries,
    matchedCount: matchedInPeriod,
    toursScheduled: entries.filter(e => inRange(e.tour_scheduled_at)).length,
    applied: entries.filter(e => inRange(e.applied_at)).length,
    leaseSigned: entries.filter(e => inRange(e.lease_signed_at)).length,
  };
}

export async function GET() {
  try {
    // Fetch all entries (we'll filter in memory for flexibility)
    const { data: entries, error } = await supabase
      .from('waitlist_entries')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching entries:', error);
      return NextResponse.json({ error: 'Failed to fetch entries' }, { status: 500 });
    }

    // No longer need to fetch available_units - matches are tracked via matched_at on waitlist_entries
    const matchedEmails = new Set<string>(); // Empty set - we now use matched_at timestamp instead

    const ytdRange = getYTDRange();
    const weekRange = getCurrentWeekRange();
    
    const ytdQuery = getRangeForQuery(ytdRange);
    const weekQuery = getRangeForQuery(weekRange);

    const ytdMetrics = calculateMetrics(entries || [], ytdQuery, matchedEmails);
    const weekMetrics = calculateMetrics(entries || [], weekQuery, matchedEmails);

    // Get funnel breakdown for all active entries
    const funnelBreakdown = {
      active: entries?.filter(e => e.outcome_status === 'active' || !e.outcome_status).length || 0,
      matched: entries?.filter(e => e.outcome_status === 'matched').length || 0,
      touring: entries?.filter(e => e.outcome_status === 'touring').length || 0,
      applied: entries?.filter(e => e.outcome_status === 'applied').length || 0,
      leased: entries?.filter(e => e.outcome_status === 'leased').length || 0,
      declined: entries?.filter(e => e.outcome_status === 'declined').length || 0,
      removed: entries?.filter(e => e.outcome_status === 'removed').length || 0,
    };

    // Property breakdown (use isSelfAdded helper for backwards compatibility)
    const propertyBreakdown: Record<string, { total: number; self: number; agent: number }> = {};
    entries?.forEach(e => {
      if (!propertyBreakdown[e.property]) {
        propertyBreakdown[e.property] = { total: 0, self: 0, agent: 0 };
      }
      propertyBreakdown[e.property].total++;
      if (isSelfAdded(e)) {
        propertyBreakdown[e.property].self++;
      } else {
        propertyBreakdown[e.property].agent++;
      }
    });

    return NextResponse.json({
      success: true,
      ytd: {
        label: `YTD ${ytdRange.start.getFullYear()}`,
        range: formatDateRange(ytdRange),
        metrics: ytdMetrics,
      },
      week: {
        label: 'This Week',
        range: formatDateRange(weekRange),
        metrics: weekMetrics,
      },
      funnel: funnelBreakdown,
      byProperty: propertyBreakdown,
      totalEntries: entries?.length || 0,
    });

  } catch (error) {
    console.error('Error in reports:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
