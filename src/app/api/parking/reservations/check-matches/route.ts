import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PARKING_SPREADSHEET_ID = '1w78XH8yuyuoZm_l1PtHIFzXygwEjS56lV0rZwEQvNwM';

interface DirectoryEntry {
  tenantCode: string;
  residentName: string;
  unitNumber: string;
  property: string;
}

// Fetch Directory entries to check for new tenants
async function fetchDirectory(): Promise<DirectoryEntry[]> {
  const url = `https://docs.google.com/spreadsheets/d/${PARKING_SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=Directory`;
  const response = await fetch(url, { cache: 'no-store' });
  const text = await response.text();
  const jsonStr = text.replace(/^[^(]*\(/, '').replace(/\);?$/, '');
  const data = JSON.parse(jsonStr);
  
  const entries: DirectoryEntry[] = [];
  const rows = data.table.rows.slice(1); // Skip header
  
  for (const row of rows) {
    const cells = row.c;
    if (!cells || !cells[0]) continue;
    
    const tenantCode = cells[0]?.v?.toString() || '';
    const residentName = cells[1]?.v || '';
    const unitNumber = cells[2]?.v?.toString() || '';
    const property = cells[3]?.v || '';
    
    if (tenantCode && residentName) {
      entries.push({
        tenantCode,
        residentName,
        unitNumber,
        property
      });
    }
  }
  
  return entries;
}

interface ReservationMatch {
  reservation_id: string;
  applicant_name: string;
  unit_number: string;
  property: string;
  spot_number: string;
  full_space_code: string;
  matched_tenant_code: string;
  matched_tenant_name: string;
}

// GET - Check for matches between active reservations and Directory
export async function GET() {
  try {
    // Fetch active reservations
    const { data: reservations, error: reservationsError } = await supabase
      .from('parking_reservations')
      .select('*')
      .eq('status', 'active');
    
    if (reservationsError) {
      console.error('Error fetching reservations:', reservationsError);
      return NextResponse.json({ error: reservationsError.message }, { status: 500 });
    }
    
    if (!reservations || reservations.length === 0) {
      return NextResponse.json({ matches: [], message: 'No active reservations' });
    }
    
    // Fetch Directory entries
    const directoryEntries = await fetchDirectory();
    
    // Find matches - a match is when a Directory entry has the same unit number 
    // as a reservation and the property matches
    const matches: ReservationMatch[] = [];
    
    for (const reservation of reservations) {
      // Normalize unit numbers for comparison (remove leading zeros, trim)
      const reservationUnit = reservation.unit_number?.toString().replace(/^0+/, '').trim().toLowerCase();
      const reservationProperty = reservation.property?.toLowerCase().trim();
      
      for (const entry of directoryEntries) {
        const entryUnit = entry.unitNumber?.toString().replace(/^0+/, '').trim().toLowerCase();
        const entryProperty = entry.property?.toLowerCase().trim();
        
        // Match by unit number and property
        if (reservationUnit && entryUnit && reservationUnit === entryUnit) {
          // Check if property matches (allow partial match)
          if (reservationProperty && entryProperty && 
              (reservationProperty.includes(entryProperty) || entryProperty.includes(reservationProperty))) {
            matches.push({
              reservation_id: reservation.id,
              applicant_name: reservation.applicant_name,
              unit_number: reservation.unit_number,
              property: reservation.property,
              spot_number: reservation.spot_number,
              full_space_code: reservation.full_space_code,
              matched_tenant_code: entry.tenantCode,
              matched_tenant_name: entry.residentName,
            });
            break; // Found a match for this reservation
          }
        }
      }
    }
    
    return NextResponse.json({ 
      matches,
      total_reservations: reservations.length,
      matched_count: matches.length,
    });
  } catch (error) {
    console.error('Error checking reservation matches:', error);
    return NextResponse.json({ error: 'Failed to check matches' }, { status: 500 });
  }
}
