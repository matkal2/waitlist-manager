import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';

const resend = new Resend(process.env.RESEND_API_KEY);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const SPREADSHEET_ID = '1OTm2nalt3DUBPzM_kQ4ZmiO0cs0dLUC2o72DYgoRA0U';

// Production agent emails
const AGENT_EMAILS: Record<string, string> = {
  'Matthew Kaleb': 'mkaleb@hpvgproperties.com',
  'Michael Dillon': 'mdillon@hpvgproperties.com',
  'Unassigned': 'leasing@hpvgproperties.com',
};

interface SheetUnit {
  property: string;
  unit_number: string;
  unit_type: string;
  rent_price: number;
  available_date: string | null;
  unique_id: string;
}

interface WaitlistEntry {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  entry_type: string;
  property: string;
  unit_type_pref: string;
  max_budget: number;
  move_in_date: string;
  move_in_date_end: string | null;
  assigned_agent: string | null;
  status: string;
}

interface MatchedEntry extends WaitlistEntry {
  matchType: 'exact' | 'flexible';
  flexibilityNote?: string;
}

function parseGoogleDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const match = dateStr.match(/Date\((\d+),(\d+),(\d+)\)/);
  if (match) {
    const year = parseInt(match[1]);
    const month = parseInt(match[2]) + 1;
    const day = parseInt(match[3]);
    return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  }
  return null;
}

function mapPropertyName(name: string): string {
  // Maps Google Sheet property codes to standard nicknames (must match properties.ts)
  const mapping: Record<string, string> = {
    'Broadway': 'Broadway',
    'Countryside_T': 'Countryside T',
    'Countryside_C': 'Countryside C',
    'Fullerton': 'Fullerton',
    'Green_Bay_246': 'Green Bay 246',
    'Green_Bay_440': 'Green Bay 440',
    'Green_Bay_546': 'Green Bay 546',
    'Greenleaf': 'Greenleaf',
    'Kedzie': 'Kedzie',
    'Kennedy': 'Kennedy',
    'Liberty': 'Liberty',
    'N_Clark': 'North Clark',
    'Park': 'Park',
    'Rogers': 'Rogers',
    'Sheffield': 'Sheffield',
    'Talman': 'Talman',
    'Warren': 'Warren',
    'W_Chicago': 'W. Chicago',
    'W_Montrose': 'W. Montrose',
    'Elston': 'Elston',
  };
  return mapping[name] || name.replace(/_/g, ' ');
}

// Normalize property names for comparison (handles legacy naming like "N. Clark" vs "North Clark")
function normalizePropertyName(name: string): string {
  const normalized = name.toLowerCase().trim();
  
  // Handle North Clark variations
  if (normalized === 'n. clark' || normalized === 'n clark' || normalized === 'north clark') {
    return 'north clark';
  }
  // Handle West Montrose variations
  if (normalized === 'w. montrose' || normalized === 'w montrose' || normalized === 'west montrose') {
    return 'w. montrose';
  }
  // Handle West Chicago variations
  if (normalized === 'w. chicago' || normalized === 'w chicago' || normalized === 'west chicago') {
    return 'w. chicago';
  }
  // Handle Countryside variations - check specific suffixes, not just any 't' or 'c'
  if (normalized.includes('countryside')) {
    // Check for explicit T/Townhouse markers
    if (normalized.endsWith(' t') || normalized.includes('townhouse') || normalized === 'countryside_t') {
      return 'countryside t';
    }
    // Check for explicit C/Court markers
    if (normalized.endsWith(' c') || normalized.includes('court') || normalized === 'countryside_c') {
      return 'countryside c';
    }
    return normalized;
  }
  // Handle Green Bay variations (address numbers can be prefix or suffix)
  if (normalized.includes('green bay') || normalized.includes('greenbay') || /\d+.*green\s*bay|green\s*bay.*\d+/.test(normalized)) {
    if (normalized.includes('246')) return 'green bay 246';
    if (normalized.includes('440')) return 'green bay 440';
    if (normalized.includes('546')) return 'green bay 546';
  }
  
  return normalized;
}

function bedroomsToUnitType(bedrooms: number): string {
  if (bedrooms === 0) return 'Studio';
  return `${bedrooms}BR`;
}

function extractUnitNumber(addressAndApt: string): string {
  const match = addressAndApt.match(/Unit:\s*(\S+)/i);
  return match ? match[1] : '';
}

async function fetchSheetUnits(): Promise<SheetUnit[]> {
  // Fetch from DASH sheet specifically
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=DASH`;
  const response = await fetch(url, { cache: 'no-store' });
  const text = await response.text();
  const jsonStr = text.replace(/^[^(]*\(/, '').replace(/\);?$/, '');
  const data = JSON.parse(jsonStr);
  
  const units: SheetUnit[] = [];
  
  for (const row of data.table.rows) {
    const cells = row.c;
    if (!cells || !cells[0]) continue;
    
    const propertyRaw = cells[0]?.v || '';
    const status = cells[5]?.v || '';
    const addressAndApt = cells[6]?.v || '';
    const bedrooms = cells[7]?.v ?? cells[7]?.f ?? null;
    const sqFootage = cells[9]?.v || 0;
    const availableDateRaw = cells[10]?.v || null;
    const rentPrice = cells[11]?.v || 0;
    const uniqueId = cells[4]?.v || '';
    
    if (status !== 'Available') continue;
    
    // Determine unit type with fallback based on square footage
    let unitType: string;
    if (bedrooms && bedrooms > 0) {
      unitType = bedroomsToUnitType(bedrooms);
    } else if (sqFootage >= 1800) {
      unitType = '3BR';
    } else if (sqFootage >= 1000) {
      unitType = '2BR';
    } else if (sqFootage >= 600) {
      unitType = '1BR';
    } else {
      unitType = 'Studio';
    }
    
    units.push({
      property: mapPropertyName(propertyRaw),
      unit_number: extractUnitNumber(addressAndApt),
      unit_type: unitType,
      rent_price: rentPrice,
      available_date: parseGoogleDate(availableDateRaw),
      unique_id: uniqueId,
    });
  }
  
  return units;
}

async function fetchWaitlistEntries(): Promise<WaitlistEntry[]> {
  const { data, error } = await supabase
    .from('waitlist_entries')
    .select('*')
    .eq('status', 'Active');
  
  if (error) throw error;
  return data || [];
}

async function getNotifiedMatches(): Promise<Set<string>> {
  const { data } = await supabase
    .from('notified_matches')
    .select('match_key');
  
  return new Set((data || []).map(d => d.match_key));
}

async function recordNotifiedMatch(matchKey: string, agent: string, unitId: string, entryIds: string[]) {
  await supabase.from('notified_matches').insert({
    match_key: matchKey,
    agent,
    unit_id: unitId,
    entry_ids: entryIds,
    notified_at: new Date().toISOString(),
  });
}

function generateMatchKey(unitId: string, agent: string): string {
  return `${unitId}:${agent}`;
}

interface UnitWithMatches {
  unit: SheetUnit;
  entries: MatchedEntry[];
}

async function sendConsolidatedAgentEmail(agent: string, unitMatches: UnitWithMatches[]) {
  const agentEmail = AGENT_EMAILS[agent];
  if (!agentEmail) return null;

  const totalMatches = unitMatches.reduce((sum, um) => sum + um.entries.length, 0);
  const totalUnits = unitMatches.length;

  // Generate HTML for each unit section
  const unitsHtml = unitMatches.map((um, unitIdx) => {
    const { unit, entries } = um;
    
    const contactListHtml = entries.map((c, idx) => {
      const moveInDisplay = c.move_in_date_end 
        ? `${new Date(c.move_in_date).toLocaleDateString()} - ${new Date(c.move_in_date_end).toLocaleDateString()}`
        : new Date(c.move_in_date).toLocaleDateString();
      
      const flexibilityBadge = c.matchType === 'flexible' 
        ? `<div style="background: #fef3c7; color: #92400e; padding: 4px 8px; border-radius: 4px; font-size: 11px; margin-top: 4px;">⚠️ ${c.flexibilityNote}</div>`
        : '';
      
      return `
      <tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 10px 8px;">${idx + 1}</td>
        <td style="padding: 10px 8px;">
          <strong>${c.full_name}</strong>
          <span style="background: ${c.entry_type === 'Internal Transfer' ? '#2563eb' : '#6b7280'}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; margin-left: 8px;">
            ${c.entry_type === 'Internal Transfer' ? '🏠 Transfer' : '👤 Prospect'}
          </span>
        </td>
        <td style="padding: 10px 8px;">${c.email || 'N/A'}</td>
        <td style="padding: 10px 8px;">${c.phone || 'N/A'}</td>
        <td style="padding: 10px 8px;">$${c.max_budget > 0 ? c.max_budget.toLocaleString() : 'Any'}</td>
        <td style="padding: 10px 8px;">
          ${moveInDisplay}
          ${flexibilityBadge}
        </td>
      </tr>
    `;
    }).join('');

    return `
      <div style="background: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb;">
        <h3 style="margin-top: 0; color: #2563eb;">${unitIdx + 1}. ${unit.property} - Unit ${unit.unit_number}</h3>
        <p style="margin: 5px 0;"><strong>Type:</strong> ${unit.unit_type} | <strong>Rent:</strong> $${unit.rent_price.toLocaleString()}/mo | <strong>Available:</strong> ${unit.available_date ? new Date(unit.available_date).toLocaleDateString() : 'Now'}</p>
        
        <table style="width: 100%; border-collapse: collapse; margin-top: 15px; background: white;">
          <thead>
            <tr style="background: #f5f5f5;">
              <th style="padding: 10px 8px; text-align: left; font-size: 12px;">#</th>
              <th style="padding: 10px 8px; text-align: left; font-size: 12px;">Name</th>
              <th style="padding: 10px 8px; text-align: left; font-size: 12px;">Email</th>
              <th style="padding: 10px 8px; text-align: left; font-size: 12px;">Phone</th>
              <th style="padding: 10px 8px; text-align: left; font-size: 12px;">Budget</th>
              <th style="padding: 10px 8px; text-align: left; font-size: 12px;">Move-in</th>
            </tr>
          </thead>
          <tbody>
            ${contactListHtml}
          </tbody>
        </table>
      </div>
    `;
  }).join('');

  const { data, error } = await resend.emails.send({
    from: 'Waitlist Manager <noreply@hpvgproperties.com>',
    to: agentEmail,
    subject: `🔔 Match Alert: ${totalUnits} unit${totalUnits > 1 ? 's' : ''} with ${totalMatches} waitlist match${totalMatches > 1 ? 'es' : ''}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
        <h2 style="color: #333;">🔔 Waitlist Match Alert</h2>
        <p>You have <strong>${totalMatches}</strong> waitlist ${totalMatches === 1 ? 'entry' : 'entries'} matching <strong>${totalUnits}</strong> available ${totalUnits === 1 ? 'unit' : 'units'}:</p>
        
        <p style="color: #666; font-size: 14px;">Internal Transfers are listed first per the "Transfer First" policy.</p>
        
        ${unitsHtml}
        
        <div style="margin-top: 30px; padding: 15px; background: #f5f5f5; border-radius: 8px;">
          <p style="margin: 0; font-size: 14px;"><strong>Next Steps:</strong></p>
          <ol style="margin: 10px 0 0 0; padding-left: 20px; font-size: 14px; color: #666;">
            <li>Contact waitlist entries in priority order (transfers first)</li>
            <li>Mark contacted entries in the Waitlist Manager</li>
            <li>Update entry status when they schedule, apply, or sign</li>
          </ol>
        </div>
        
        <p style="color: #666; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
          This is an automated notification from the Waitlist Manager system.<br/>
          <a href="https://waitlist-hpvg.vercel.app/waitlist" style="color: #2563eb;">Open Waitlist Manager →</a>
        </p>
      </div>
    `,
  });

  return { data, error, agentEmail };
}

// Helper function to check date match and return match type
function checkDateMatch(entry: WaitlistEntry, unit: SheetUnit, today: Date): { matches: boolean; matchType: 'exact' | 'flexible'; flexibilityNote?: string } {
  const entryMoveInStart = new Date(entry.move_in_date);
  entryMoveInStart.setHours(0, 0, 0, 0);
  const entryMoveInEnd = entry.move_in_date_end 
    ? new Date(entry.move_in_date_end) 
    : entryMoveInStart;
  entryMoveInEnd.setHours(0, 0, 0, 0);
  
  // Determine unit availability date
  let unitAvailable: Date;
  const isAvailableNow = !unit.available_date || 
    unit.available_date.toLowerCase() === 'now' || 
    unit.available_date.toLowerCase() === 'available';
  
  if (isAvailableNow) {
    unitAvailable = today;
  } else {
    unitAvailable = new Date(unit.available_date!);
    unitAvailable.setHours(0, 0, 0, 0);
  }
  
  // Calculate 1-month flexibility windows
  const oneMonthBeforeStart = new Date(entryMoveInStart);
  oneMonthBeforeStart.setDate(oneMonthBeforeStart.getDate() - 30);
  const oneMonthAfterEnd = new Date(entryMoveInEnd);
  oneMonthAfterEnd.setDate(oneMonthAfterEnd.getDate() + 30);
  
  // Check if unit is within the exact range
  const isExactMatch = unitAvailable >= entryMoveInStart && unitAvailable <= entryMoveInEnd;
  
  // Check if unit is within 1 month before the range
  const isBeforeRange = unitAvailable >= oneMonthBeforeStart && unitAvailable < entryMoveInStart;
  
  // Check if unit is within 1 month after the range
  const isAfterRange = unitAvailable > entryMoveInEnd && unitAvailable <= oneMonthAfterEnd;
  
  if (isExactMatch) {
    return { matches: true, matchType: 'exact' };
  } else if (isBeforeRange) {
    return { 
      matches: true, 
      matchType: 'flexible', 
      flexibilityNote: `Unit available before requested range (${new Date(unit.available_date!).toLocaleDateString()})` 
    };
  } else if (isAfterRange) {
    return { 
      matches: true, 
      matchType: 'flexible', 
      flexibilityNote: `Unit available after requested range (${new Date(unit.available_date!).toLocaleDateString()})` 
    };
  }
  
  return { matches: false, matchType: 'exact' };
}

export async function GET() {
  try {
    // Fetch current data
    const [units, entries, notifiedMatches] = await Promise.all([
      fetchSheetUnits(),
      fetchWaitlistEntries(),
      getNotifiedMatches(),
    ]);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Build a map of agent -> unit matches (consolidated per agent)
    const agentUnitMatches: Record<string, UnitWithMatches[]> = {};
    const newMatchKeys: { key: string; agent: string; unitId: string; entryIds: string[] }[] = [];

    for (const unit of units) {
      const matchingEntries: MatchedEntry[] = entries
        .filter(entry => {
          // ===== MANDATORY MATCHES =====
          // Use normalized property names for comparison (handles "N. Clark" vs "North Clark" etc.)
          if (normalizePropertyName(entry.property) !== normalizePropertyName(unit.property)) return false;
          const entryUnitTypes = entry.unit_type_pref.split(',').map(t => t.trim());
          if (!entryUnitTypes.includes(unit.unit_type)) return false;
          const dateCheck = checkDateMatch(entry, unit, today);
          if (!dateCheck.matches) return false;
          // ===== OPTIONAL MATCHES =====
          if (entry.max_budget > 0 && unit.rent_price > entry.max_budget) return false;
          return true;
        })
        .map(entry => {
          const dateCheck = checkDateMatch(entry, unit, today);
          return {
            ...entry,
            matchType: dateCheck.matchType,
            flexibilityNote: dateCheck.flexibilityNote,
          };
        });

      if (matchingEntries.length === 0) continue;

      // Group entries by agent
      const entriesByAgent: Record<string, MatchedEntry[]> = {};
      matchingEntries.forEach(e => {
        const agent = e.assigned_agent || 'Unassigned';
        if (!entriesByAgent[agent]) entriesByAgent[agent] = [];
        entriesByAgent[agent].push(e);
      });

      // Add to consolidated agent map (only if not already notified)
      for (const [agent, agentEntries] of Object.entries(entriesByAgent)) {
        const matchKey = generateMatchKey(unit.unique_id, agent);
        
        if (notifiedMatches.has(matchKey)) {
          continue; // Already notified for this unit/agent combo
        }

        // Sort entries: Internal Transfers first
        agentEntries.sort((a, b) => {
          if (a.entry_type !== b.entry_type) {
            return a.entry_type === 'Internal Transfer' ? -1 : 1;
          }
          return 0;
        });

        // Add to consolidated map
        if (!agentUnitMatches[agent]) agentUnitMatches[agent] = [];
        agentUnitMatches[agent].push({ unit, entries: agentEntries });
        
        // Track the match key for recording after email is sent
        newMatchKeys.push({
          key: matchKey,
          agent,
          unitId: unit.unique_id,
          entryIds: agentEntries.map(e => e.id),
        });
      }
    }

    // Send ONE consolidated email per agent with ALL their matches
    const notifications: { agent: string; unitsCount: number; totalContacts: number; success: boolean }[] = [];

    for (const [agent, unitMatches] of Object.entries(agentUnitMatches)) {
      if (unitMatches.length === 0) continue;

      const result = await sendConsolidatedAgentEmail(agent, unitMatches);
      const totalContacts = unitMatches.reduce((sum, um) => sum + um.entries.length, 0);
      
      if (result && !result.error) {
        // Record all match keys for this agent
        const agentMatchKeys = newMatchKeys.filter(mk => mk.agent === agent);
        for (const mk of agentMatchKeys) {
          await recordNotifiedMatch(mk.key, mk.agent, mk.unitId, mk.entryIds);
        }
        
        // Track matches in waitlist_entries - update matched_at for all matched entries
        const allEntryIds = agentMatchKeys.flatMap(mk => mk.entryIds);
        if (allEntryIds.length > 0) {
          const { error: updateError } = await supabase
            .from('waitlist_entries')
            .update({ 
              matched_at: new Date().toISOString(),
              outcome_status: 'matched'
            })
            .in('id', allEntryIds)
            .is('matched_at', null); // Only update if not already matched
          
          if (updateError) {
            console.error('[Auto-notify] Failed to update matched_at:', updateError);
          } else {
            console.log(`[Auto-notify] Updated ${allEntryIds.length} entries with matched_at`);
          }
        }
        
        notifications.push({
          agent,
          unitsCount: unitMatches.length,
          totalContacts,
          success: true,
        });
      } else {
        notifications.push({
          agent,
          unitsCount: unitMatches.length,
          totalContacts,
          success: false,
        });
      }
    }

    // Audit: Check for property name mismatches across all entries and units
    const unitProperties = [...new Set(units.map(u => u.property))];
    const entryProperties = [...new Set(entries.map(e => e.property))];
    
    // Find entry properties that don't have a direct match but do have a normalized match
    const propertyMismatches: { entryProperty: string; normalizedTo: string; matchesUnit: string | null }[] = [];
    for (const entryProp of entryProperties) {
      const directMatch = unitProperties.find(up => up === entryProp);
      if (!directMatch) {
        const normalizedMatch = unitProperties.find(up => 
          normalizePropertyName(up) === normalizePropertyName(entryProp)
        );
        propertyMismatches.push({
          entryProperty: entryProp,
          normalizedTo: normalizePropertyName(entryProp),
          matchesUnit: normalizedMatch || null,
        });
      }
    }

    return NextResponse.json({
      success: true,
      checked: new Date().toISOString(),
      unitsChecked: units.length,
      entriesChecked: entries.length,
      emailsSent: notifications.filter(n => n.success).length,
      notifications,
      propertyAudit: {
        unitProperties,
        entryProperties,
        mismatches: propertyMismatches,
        unmatchedEntries: propertyMismatches.filter(m => !m.matchesUnit).map(m => m.entryProperty),
      },
    });
  } catch (error) {
    console.error('Auto-notify error:', error);
    return NextResponse.json(
      { error: 'Failed to check for matches', details: String(error) },
      { status: 500 }
    );
  }
}
