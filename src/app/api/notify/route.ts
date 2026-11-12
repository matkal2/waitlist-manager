import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { WaitlistEntry } from '@/types/database';
import { getUnitMatchType, type MatchableUnit } from '@/lib/waitlist-matching';
import { getAgentDirectory, UNASSIGNED_AGENT } from '@/lib/agents';
import { sortByPriority, type MatchedEntry } from '@/lib/match-alert-email';
import { sendMatchAlert, type MatchAlertResult } from '@/lib/match-notifications';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface NotifyRequest {
  unit: MatchableUnit;
  entryIds: string[];
}

// Manual "Notify" from Match Alerts: emails each assigned agent (unassigned go to the leasing inbox) about one unit
export async function POST(request: NextRequest) {
  try {
    const { unit, entryIds }: NotifyRequest = await request.json();
    if (!unit || !entryIds?.length) {
      return NextResponse.json({ error: 'No entries provided' }, { status: 400 });
    }

    const [{ data, error }, directory] = await Promise.all([
      supabase.from('waitlist_entries').select('*').in('id', entryIds),
      getAgentDirectory(),
    ]);
    if (error) throw error;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const byAgent: Record<string, MatchedEntry[]> = {};
    for (const entry of (data || []) as WaitlistEntry[]) {
      const agent = entry.assigned_agent?.trim() || UNASSIGNED_AGENT;
      (byAgent[agent] ||= []).push({ ...entry, matchType: getUnitMatchType(entry, unit, today) || 'flexible' });
    }

    const results: MatchAlertResult[] = [];
    for (const [agent, entries] of Object.entries(byAgent)) {
      results.push(await sendMatchAlert(agent, [{ unit, entries: sortByPriority(entries) }], directory));
    }

    const failed = results.filter(r => !r.success);
    return NextResponse.json(
      { success: failed.length === 0, results },
      { status: failed.length === results.length ? 500 : 200 }
    );
  } catch (error) {
    console.error('Notification API error:', error);
    return NextResponse.json({ error: 'Failed to process notification request' }, { status: 500 });
  }
}
