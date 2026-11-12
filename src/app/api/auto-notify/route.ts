import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { WaitlistEntry } from '@/types/database';
import { getUnitMatchType, type MatchableUnit } from '@/lib/waitlist-matching';
import { getAgentDirectory, UNASSIGNED_AGENT } from '@/lib/agents';
import { sortByPriority, type MatchedEntry, type UnitWithMatches } from '@/lib/match-alert-email';
import { sendMatchAlert, type MatchAlertResult } from '@/lib/match-notifications';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const SPREADSHEET_ID = '1OTm2nalt3DUBPzM_kQ4ZmiO0cs0dLUC2o72DYgoRA0U';

// Outcomes that mean the person no longer needs a unit
const CLOSED_OUTCOMES = ['leased', 'declined', 'removed'];

// A unit/person pair is emailed once; if the unit is still (or again) available after this, the agent is reminded
const RENOTIFY_AFTER_DAYS = 60;

function parseGoogleDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const match = dateStr.match(/Date\((\d+),(\d+),(\d+)\)/);
  if (!match) return null;
  const month = parseInt(match[2]) + 1;
  return `${match[1]}-${month.toString().padStart(2, '0')}-${match[3].padStart(2, '0')}`;
}

// Maps Google Sheet property codes to standard nicknames (must match properties.ts)
function mapPropertyName(name: string): string {
  const mapping: Record<string, string> = {
    'Countryside_T': 'Countryside T',
    'Countryside_C': 'Countryside C',
    'Green_Bay_246': 'Green Bay 246',
    'Green_Bay_440': 'Green Bay 440',
    'Green_Bay_546': 'Green Bay 546',
    'N_Clark': 'North Clark',
    'W_Chicago': 'W. Chicago',
    'W_Montrose': 'W. Montrose',
  };
  return mapping[name] || name.replace(/_/g, ' ');
}

function bedroomsToUnitType(bedrooms: number): string {
  return bedrooms === 0 ? 'Studio' : `${bedrooms}BR`;
}

function extractUnitNumber(addressAndApt: string): string {
  const match = addressAndApt.match(/Unit:\s*(\S+)/i);
  return match ? match[1] : '';
}

async function fetchSheetUnits(): Promise<MatchableUnit[]> {
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=DASH`;
  const response = await fetch(url, { cache: 'no-store' });
  const text = await response.text();
  const data = JSON.parse(text.replace(/^[^(]*\(/, '').replace(/\);?$/, ''));

  const units: MatchableUnit[] = [];
  for (const row of data.table.rows) {
    const cells = row.c;
    if (!cells || !cells[0]) continue;
    if ((cells[5]?.v || '') !== 'Available') continue;

    const bedrooms = cells[7]?.v ?? cells[7]?.f ?? null;
    const sqFootage = cells[9]?.v || 0;

    // Fall back to square footage when the bedroom count is blank
    let unitType: string;
    if (bedrooms && bedrooms > 0) unitType = bedroomsToUnitType(bedrooms);
    else if (sqFootage >= 1800) unitType = '3BR';
    else if (sqFootage >= 1000) unitType = '2BR';
    else if (sqFootage >= 600) unitType = '1BR';
    else unitType = 'Studio';

    units.push({
      property: mapPropertyName(cells[0]?.v || ''),
      unit_number: extractUnitNumber(cells[6]?.v || ''),
      unit_type: unitType,
      rent_price: cells[11]?.v || 0,
      available_date: parseGoogleDate(cells[10]?.v || null),
      unique_id: cells[4]?.v || '',
    });
  }
  return units;
}

async function fetchOpenEntries(): Promise<WaitlistEntry[]> {
  const { data, error } = await supabase
    .from('waitlist_entries')
    .select('*')
    .eq('status', 'Active')
    .is('archived_at', null);
  if (error) throw error;
  return ((data || []) as WaitlistEntry[]).filter(e => !CLOSED_OUTCOMES.includes(e.outcome_status || ''));
}

// "unitId:entryId" pairs already emailed within the re-notify window
async function getNotifiedPairs(): Promise<Set<string>> {
  const since = new Date();
  since.setDate(since.getDate() - RENOTIFY_AFTER_DAYS);
  const { data, error } = await supabase
    .from('notified_matches')
    .select('unit_id, entry_ids')
    .gte('notified_at', since.toISOString());
  if (error) throw error;

  const pairs = new Set<string>();
  for (const row of data || []) {
    for (const entryId of row.entry_ids || []) pairs.add(`${row.unit_id}:${entryId}`);
  }
  return pairs;
}

export async function GET() {
  try {
    const [units, entries, notifiedPairs, directory] = await Promise.all([
      fetchSheetUnits(),
      fetchOpenEntries(),
      getNotifiedPairs(),
      getAgentDirectory(),
    ]);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // One email per agent covering every unit with new matches for them
    const byAgent: Record<string, UnitWithMatches[]> = {};
    for (const unit of units) {
      const byAgentForUnit: Record<string, MatchedEntry[]> = {};
      for (const entry of entries) {
        if (notifiedPairs.has(`${unit.unique_id}:${entry.id}`)) continue;
        const matchType = getUnitMatchType(entry, unit, today);
        if (!matchType) continue;
        const agent = entry.assigned_agent?.trim() || UNASSIGNED_AGENT;
        (byAgentForUnit[agent] ||= []).push({ ...entry, matchType });
      }
      for (const [agent, matched] of Object.entries(byAgentForUnit)) {
        (byAgent[agent] ||= []).push({ unit, entries: sortByPriority(matched) });
      }
    }

    const notifications: MatchAlertResult[] = [];
    for (const [agent, unitMatches] of Object.entries(byAgent)) {
      notifications.push(await sendMatchAlert(agent, unitMatches, directory));
    }

    return NextResponse.json({
      success: true,
      checked: new Date().toISOString(),
      unitsChecked: units.length,
      entriesChecked: entries.length,
      emailsSent: notifications.filter(n => n.success).length,
      notifications: notifications.map(({ agent, units, people, success, error }) => ({ agent, units, people, success, error })),
    });
  } catch (error) {
    console.error('Auto-notify error:', error);
    return NextResponse.json({ error: 'Failed to check for matches', details: String(error) }, { status: 500 });
  }
}
