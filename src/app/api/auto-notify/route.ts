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
  assigned_agent: string | null;
  status: string;
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
  const mapping: Record<string, string> = {
    'Broadway': 'Broadway',
    'Countryside_T': 'Countryside T',
    'Countryside_C': 'Countryside C',
    'Fullerton': 'Fullerton',
    'Green_Bay_246': '246 Green Bay',
    'Green_Bay_440': '440 Green Bay',
    'Green_Bay_546': '546 Green Bay',
    'Greenleaf': 'Greenleaf',
    'Kedzie': 'Kedzie',
    'Kennedy': 'Kennedy',
    'Liberty': 'Liberty',
    'N_Clark': 'N. Clark',
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

async function sendAgentEmail(agent: string, unit: SheetUnit, entries: WaitlistEntry[]) {
  const agentEmail = AGENT_EMAILS[agent];
  if (!agentEmail) return null;

  const contactListHtml = entries.map((c, idx) => `
    <tr style="border-bottom: 1px solid #eee;">
      <td style="padding: 12px 8px;">${idx + 1}</td>
      <td style="padding: 12px 8px;">
        <strong>${c.full_name}</strong>
        <span style="background: ${c.entry_type === 'Internal Transfer' ? '#2563eb' : '#6b7280'}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; margin-left: 8px;">
          ${c.entry_type === 'Internal Transfer' ? '🏠 Transfer' : '👤 Prospect'}
        </span>
      </td>
      <td style="padding: 12px 8px;">${c.email || 'N/A'}</td>
      <td style="padding: 12px 8px;">${c.phone || 'N/A'}</td>
      <td style="padding: 12px 8px;">$${c.max_budget > 0 ? c.max_budget.toLocaleString() : 'Any'}</td>
      <td style="padding: 12px 8px;">${new Date(c.move_in_date).toLocaleDateString()}</td>
    </tr>
  `).join('');

  const { data, error } = await resend.emails.send({
    from: 'Waitlist Manager <noreply@hpvgproperties.com>',
    to: agentEmail,
    subject: `🔔 NEW Match: ${unit.property} Unit ${unit.unit_number} - ${entries.length} people waiting`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
        <h2 style="color: #333;">🔔 Automatic Match Alert</h2>
        <p>A unit just became available with <strong>${entries.length}</strong> matching waitlist ${entries.length === 1 ? 'entry' : 'entries'}:</p>
        
        <div style="background: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb;">
          <h3 style="margin-top: 0; color: #2563eb;">${unit.property} - Unit ${unit.unit_number}</h3>
          <p style="margin: 5px 0;"><strong>Type:</strong> ${unit.unit_type}</p>
          <p style="margin: 5px 0;"><strong>Rent:</strong> $${unit.rent_price.toLocaleString()}/month</p>
          <p style="margin: 5px 0;"><strong>Available:</strong> ${unit.available_date ? new Date(unit.available_date).toLocaleDateString() : 'Now'}</p>
        </div>
        
        <h3 style="color: #333; margin-top: 30px;">People to Contact (Priority Order):</h3>
        <p style="color: #666; font-size: 14px;">Internal Transfers are listed first per the "Transfer First" policy.</p>
        
        <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
          <thead>
            <tr style="background: #f5f5f5;">
              <th style="padding: 12px 8px; text-align: left;">#</th>
              <th style="padding: 12px 8px; text-align: left;">Name</th>
              <th style="padding: 12px 8px; text-align: left;">Email</th>
              <th style="padding: 12px 8px; text-align: left;">Phone</th>
              <th style="padding: 12px 8px; text-align: left;">Budget</th>
              <th style="padding: 12px 8px; text-align: left;">Move-in</th>
            </tr>
          </thead>
          <tbody>
            ${contactListHtml}
          </tbody>
        </table>
        
        <p style="color: #666; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
          This is an automated notification from the Waitlist Manager system.
        </p>
      </div>
    `,
  });

  return { data, error, agentEmail };
}

export async function GET() {
  try {
    // Fetch current data
    const [units, entries, notifiedMatches] = await Promise.all([
      fetchSheetUnits(),
      fetchWaitlistEntries(),
      getNotifiedMatches(),
    ]);

    const notifications: { agent: string; unit: string; contacts: number; success: boolean }[] = [];

    // Find matches and send notifications for new ones
    for (const unit of units) {
      const matchingEntries = entries.filter(entry => {
        if (entry.property !== unit.property) return false;
        if (entry.unit_type_pref !== unit.unit_type) return false;
        if (entry.max_budget > 0 && unit.rent_price > entry.max_budget) return false;
        return true;
      });

      if (matchingEntries.length === 0) continue;

      // Group by agent
      const entriesByAgent: Record<string, WaitlistEntry[]> = {};
      matchingEntries.forEach(e => {
        const agent = e.assigned_agent || 'Unassigned';
        if (agent === 'Unassigned') return;
        if (!entriesByAgent[agent]) entriesByAgent[agent] = [];
        entriesByAgent[agent].push(e);
      });

      // Send notifications for each agent if not already notified
      for (const [agent, agentEntries] of Object.entries(entriesByAgent)) {
        const matchKey = generateMatchKey(unit.unique_id, agent);
        
        if (notifiedMatches.has(matchKey)) {
          continue; // Already notified
        }

        // Sort entries: Internal Transfers first
        agentEntries.sort((a, b) => {
          if (a.entry_type !== b.entry_type) {
            return a.entry_type === 'Internal Transfer' ? -1 : 1;
          }
          return 0;
        });

        // Send email
        const result = await sendAgentEmail(agent, unit, agentEntries);
        
        if (result && !result.error) {
          // Record the notification
          await recordNotifiedMatch(
            matchKey,
            agent,
            unit.unique_id,
            agentEntries.map(e => e.id)
          );
          
          notifications.push({
            agent,
            unit: `${unit.property} ${unit.unit_number}`,
            contacts: agentEntries.length,
            success: true,
          });
        } else {
          notifications.push({
            agent,
            unit: `${unit.property} ${unit.unit_number}`,
            contacts: agentEntries.length,
            success: false,
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      checked: new Date().toISOString(),
      unitsChecked: units.length,
      entriesChecked: entries.length,
      notificationsSent: notifications.filter(n => n.success).length,
      notifications,
    });
  } catch (error) {
    console.error('Auto-notify error:', error);
    return NextResponse.json(
      { error: 'Failed to check for matches', details: String(error) },
      { status: 500 }
    );
  }
}
