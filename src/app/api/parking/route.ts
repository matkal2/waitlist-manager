import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ParkingReservation } from '@/types/database';

const PARKING_SPREADSHEET_ID = '1w78XH8yuyuoZm_l1PtHIFzXygwEjS56lV0rZwEQvNwM';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface ParkingSpot {
  id: string;
  property: string;
  spot_type: string; // Indoor or Outdoor
  spot_number: string;
  full_space_code: string;
  monthly_rent: number;
  status: 'Occupied' | 'Vacant' | 'Notice' | 'Reserved' | 'Future';
  tenant_code: string | null;
  tenant_name: string | null;
  unit_number: string | null;
  lease_start_date: string | null;
  termination_date: string | null;
  available_date: string | null;
  has_ev_charging: boolean;
  is_handicap: boolean;
  space_size: string | null;
  // Future tenant info (when a spot is pre-assigned)
  future_tenant_code: string | null;
  future_tenant_name: string | null;
  future_unit_number: string | null;
  future_start_date: string | null;
  has_future_tenant: boolean;
  // Reservation info (for applicants in screening)
  reservation_id: string | null;
  reserved_for_applicant: string | null;
  reserved_for_unit: string | null;
  reservation_date: string | null;
  expected_move_in: string | null;
}

interface DirectoryEntry {
  residentName: string;
  unitNumber: string | null;
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

function normalizeStatus(status: string): ParkingSpot['status'] {
  const upper = (status || '').toUpperCase().trim();
  if (upper === 'CURRENT') return 'Occupied';
  if (upper === 'VACANT') return 'Vacant';
  if (upper === 'NOTICE') return 'Notice';
  if (upper === 'HP SPOT') return 'Reserved';
  if (upper === 'FUTURE') return 'Future';
  return 'Occupied';
}

// Determine actual status based on termination date, tenant, and lease start date
function determineStatus(
  rawStatus: ParkingSpot['status'],
  terminationDate: string | null,
  tenantCode: string | null,
  leaseStartDate: string | null
): ParkingSpot['status'] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // If it's a reserved spot (handicap), keep it
  if (rawStatus === 'Reserved') return 'Reserved';
  
  // If lease start date is in the future, the spot is currently vacant (with future assignment)
  if (leaseStartDate && tenantCode) {
    const startDate = new Date(leaseStartDate);
    startDate.setHours(0, 0, 0, 0);
    if (startDate > today) {
      return 'Vacant'; // Currently vacant, but has future tenant
    }
  }
  
  // If there's a termination date
  if (terminationDate) {
    const termDate = new Date(terminationDate);
    termDate.setHours(0, 0, 0, 0);
    
    // If termination date has passed, spot is now vacant
    if (termDate < today) {
      return 'Vacant';
    }
    
    // If termination date is in the future, spot is on notice
    if (termDate >= today) {
      return 'Notice';
    }
  }
  
  // If there's a tenant with no termination, it's occupied
  if (tenantCode && tenantCode.trim() !== '') {
    return 'Occupied';
  }
  
  // No tenant = vacant
  return 'Vacant';
}

// Title case property names: "WEST MONTROSE" -> "West Montrose"
function titleCaseProperty(name: string): string {
  return name
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

async function fetchDirectory(): Promise<Map<string, DirectoryEntry>> {
  const url = `https://docs.google.com/spreadsheets/d/${PARKING_SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=Directory`;
  const response = await fetch(url, { cache: 'no-store' });
  const text = await response.text();
  const jsonStr = text.replace(/^[^(]*\(/, '').replace(/\);?$/, '');
  const data = JSON.parse(jsonStr);
  
  const directoryMap = new Map<string, DirectoryEntry>();
  
  // Data starts from the first row (Google Sheets API already excludes header)
  const rows = data.table.rows;
  
  for (const row of rows) {
    const cells = row.c;
    if (!cells) continue;
    
    // Column B (index 1) = Unit Number, Column C (index 2) = Tenant Code, Column D (index 3) = Resident Name
    // Column S (index 18) = Unique ID (e.g., "elston 3434-101")
    let unitNumber = cells[1]?.v?.toString() || cells[1]?.f?.toString() || null;
    const tenantCode = cells[2]?.v?.toString() || '';
    const residentName = cells[3]?.v?.toString() || '';
    const uniqueId = cells[18]?.v?.toString() || '';
    
    // If unitNumber is empty, try to extract from uniqueId (format: "project unit-number")
    // Examples: "elston 3434-101" -> "3434-101", "elston 3434-G1" -> "3434-G1"
    if (!unitNumber && uniqueId) {
      const parts = uniqueId.split(' ');
      if (parts.length >= 2) {
        unitNumber = parts.slice(1).join(' '); // Everything after the project name
      }
    }
    
    if (tenantCode && residentName) {
      directoryMap.set(tenantCode, { residentName, unitNumber });
    }
  }
  
  return directoryMap;
}

async function fetchParkingSpots(directoryMap: Map<string, DirectoryEntry>): Promise<ParkingSpot[]> {
  // Target the Import tab specifically
  const url = `https://docs.google.com/spreadsheets/d/${PARKING_SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=Import`;
  const response = await fetch(url, { cache: 'no-store' });
  const text = await response.text();
  const jsonStr = text.replace(/^[^(]*\(/, '').replace(/\);?$/, '');
  const data = JSON.parse(jsonStr);
  
  // Use a Map to merge multiple rows for the same spot (e.g., NOTICE + FUTURE rows)
  const spotMap = new Map<string, ParkingSpot>();
  // Track future tenant info separately to merge with Notice spots
  const futureTenantsMap = new Map<string, { tenantCode: string; leaseStartDate: string }>();
  
  // Skip header rows (first 2 rows based on data structure)
  const rows = data.table.rows.slice(2);
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // First pass: collect all rows and identify future tenant assignments
  for (const row of rows) {
    const cells = row.c;
    if (!cells || !cells[0]) continue;
    
    const type = cells[1]?.v || '';
    if (type?.toString().toLowerCase() !== 'parking') continue;
    
    const fullSpaceCode = cells[4]?.v?.toString() || cells[4]?.f || '';
    if (!fullSpaceCode) continue;
    
    const statusRaw = cells[17]?.v || 'CURRENT'; // Column R
    const tenantCode = cells[20]?.v || null; // Column U
    const leaseStartDateRaw = cells[22]?.v || null; // Column W
    const leaseStartDate = parseGoogleDate(leaseStartDateRaw);
    
    const rawStatus = normalizeStatus(statusRaw);
    
    // If this row is marked as FUTURE status, or has a future lease start date, track it
    if (rawStatus === 'Future' || (leaseStartDate && tenantCode && new Date(leaseStartDate) > today)) {
      futureTenantsMap.set(fullSpaceCode, {
        tenantCode: tenantCode || '',
        leaseStartDate: leaseStartDate || ''
      });
    }
  }
  
  // Second pass: build spot records and merge future tenant info
  for (const row of rows) {
    const cells = row.c;
    if (!cells || !cells[0]) continue;
    
    const propertyRaw = cells[0]?.v || '';
    const type = cells[1]?.v || '';
    
    // Only process parking rows (case-insensitive check)
    if (type?.toString().toLowerCase() !== 'parking') continue;
    
    // Title case the property name
    const property = titleCaseProperty(propertyRaw);
    
    // Exclude Countryside T Parking (not rented out)
    if (property.toLowerCase().includes('countryside t')) continue;
    
    const spotType = cells[2]?.v || 'Indoor'; // Indoor or Outdoor
    const fullSpaceCode = cells[4]?.v?.toString() || cells[4]?.f || '';
    if (!fullSpaceCode) continue;
    
    // Use formatted value (f) first to preserve leading zeros and letters like "02", "A1", fallback to raw value
    // Handle both numeric and alphanumeric spot numbers
    let spotNumber = '';
    if (cells[5]?.f) {
      spotNumber = cells[5].f.toString();
    } else if (cells[5]?.v !== null && cells[5]?.v !== undefined) {
      spotNumber = String(cells[5].v);
    }
    // If spot number is still empty, try to extract from full space code (last part after dash)
    if (!spotNumber && fullSpaceCode) {
      const parts = fullSpaceCode.split('-');
      spotNumber = parts[parts.length - 1] || '';
    }
    const monthlyRent = cells[8]?.v || 0; // Final price (column I)
    const spaceSize = cells[9]?.v || null;
    const hasEvCharging = (cells[10]?.v || '').includes('EV');
    const isHandicap = (cells[11]?.v || '').includes('Handicap');
    const statusRaw = cells[17]?.v || 'CURRENT'; // Column R
    const availableDateRaw = cells[18]?.v || null; // Column S
    const tenantCode = cells[20]?.v || null; // Column U
    const leaseStartDateRaw = cells[22]?.v || null; // Column W
    const terminationDateRaw = cells[23]?.v || null; // Column X
    
    // Future tenant columns (for NOTICE rows with incoming tenant)
    const futureFlagCol24 = cells[24]?.v?.toString().toUpperCase() || ''; // Column Y - status (might have "FUTURE" or "NOTICE")
    const futureTenantCodeCol26 = cells[26]?.v || null; // Column AA - future tenant code
    const futureLeaseStartCol28 = cells[28]?.v || null; // Column AC - future lease start
    const futureFlagCol30 = cells[30]?.v?.toString().toUpperCase() || ''; // Column AE - "FUTURE" indicator
    
    const rawStatus = normalizeStatus(statusRaw);
    const terminationDate = parseGoogleDate(terminationDateRaw);
    const availableDate = parseGoogleDate(availableDateRaw);
    const leaseStartDate = parseGoogleDate(leaseStartDateRaw);
    const futureLeaseStartDate = parseGoogleDate(futureLeaseStartCol28);
    
    // Check if the current tenant's lease starts in the future
    const currentLeaseIsFuture = leaseStartDate && tenantCode && new Date(leaseStartDate) > today;
    
    // Check if this row has inline future tenant data (NOTICE row with future assignment in same row)
    const hasInlineFutureTenant = (futureFlagCol24 === 'FUTURE' || futureFlagCol30 === 'FUTURE') && futureTenantCodeCol26;
    
    // Skip FUTURE-status rows in the main spot list - we'll merge their data into existing spots
    if (rawStatus === 'Future') {
      // But if this spot doesn't exist yet (pure future assignment to vacant spot), create it
      if (!spotMap.has(fullSpaceCode)) {
        const futureEntry = tenantCode ? directoryMap.get(tenantCode) : null;
        spotMap.set(fullSpaceCode, {
          id: fullSpaceCode,
          property,
          spot_type: spotType,
          spot_number: spotNumber,
          full_space_code: fullSpaceCode,
          monthly_rent: monthlyRent,
          status: 'Vacant', // Currently vacant with future tenant
          tenant_code: null,
          tenant_name: null,
          unit_number: null,
          lease_start_date: null,
          termination_date: null,
          available_date: availableDate || new Date().toISOString().split('T')[0],
          has_ev_charging: hasEvCharging,
          is_handicap: isHandicap,
          space_size: spaceSize,
          future_tenant_code: tenantCode,
          future_tenant_name: futureEntry?.residentName || (tenantCode ? `(${tenantCode})` : null),
          future_unit_number: futureEntry?.unitNumber || null,
          future_start_date: leaseStartDate,
          has_future_tenant: true,
          reservation_id: null,
          reserved_for_applicant: null,
          reserved_for_unit: null,
          reservation_date: null,
          expected_move_in: null,
        });
      } else {
        // Spot already exists (e.g., Notice row came first) - merge future tenant info
        const existingSpot = spotMap.get(fullSpaceCode)!;
        const futureEntry = tenantCode ? directoryMap.get(tenantCode) : null;
        existingSpot.future_tenant_code = tenantCode;
        existingSpot.future_tenant_name = futureEntry?.residentName || (tenantCode ? `(${tenantCode})` : null);
        existingSpot.future_unit_number = futureEntry?.unitNumber || null;
        existingSpot.future_start_date = leaseStartDate;
        existingSpot.has_future_tenant = true;
      }
      continue;
    }
    
    // Determine future tenant info - from inline columns or when lease starts in the future
    let futureTenantCode: string | null = null;
    let futureTenantName: string | null = null;
    let futureUnitNumber: string | null = null;
    let effectiveFutureStartDate: string | null = null;
    let hasFutureTenant = false;
    
    // First check: inline future tenant data in same row (NOTICE rows with future assignment)
    if (hasInlineFutureTenant) {
      futureTenantCode = futureTenantCodeCol26;
      const futureEntry = futureTenantCodeCol26 ? directoryMap.get(futureTenantCodeCol26) : null;
      futureTenantName = futureEntry?.residentName || (futureTenantCodeCol26 ? `(${futureTenantCodeCol26})` : null);
      futureUnitNumber = futureEntry?.unitNumber || null;
      effectiveFutureStartDate = futureLeaseStartDate;
      hasFutureTenant = true;
    }
    // Second check: current tenant's lease starts in the future
    else if (currentLeaseIsFuture) {
      futureTenantCode = tenantCode;
      const futureEntry = tenantCode ? directoryMap.get(tenantCode) : null;
      // Fallback: show tenant code if not in Directory
      futureTenantName = futureEntry?.residentName || (tenantCode ? `(${tenantCode})` : null);
      futureUnitNumber = futureEntry?.unitNumber || null;
      effectiveFutureStartDate = leaseStartDate;
      hasFutureTenant = true;
    }
    
    // Determine actual status
    const status = determineStatus(rawStatus, terminationDate, currentLeaseIsFuture ? null : tenantCode, leaseStartDate);
    
    // For current tenant display, don't show if their lease hasn't started yet
    const effectiveTenantCode = currentLeaseIsFuture ? null : tenantCode;
    const directoryEntry = effectiveTenantCode ? directoryMap.get(effectiveTenantCode) : null;
    // Fallback: if tenant code exists but not in Directory, show code as name indicator
    const tenantName = directoryEntry?.residentName || (effectiveTenantCode ? `(${effectiveTenantCode})` : null);
    const unitNumber = directoryEntry?.unitNumber || null;
    
    // For Notice spots, available date is the day after termination
    // For Vacant spots, use the available date from sheet or today
    let effectiveAvailableDate: string | null = null;
    if (status === 'Notice' && terminationDate) {
      const nextDay = new Date(terminationDate);
      nextDay.setDate(nextDay.getDate() + 1);
      effectiveAvailableDate = nextDay.toISOString().split('T')[0];
    } else if (status === 'Vacant') {
      effectiveAvailableDate = availableDate || new Date().toISOString().split('T')[0];
    }
    
    // Check if there's a future tenant for this spot from a separate FUTURE row
    const futureTenantFromMap = futureTenantsMap.get(fullSpaceCode);
    if (futureTenantFromMap && !hasFutureTenant && futureTenantFromMap.tenantCode !== effectiveTenantCode) {
      // There's a separate future tenant assignment for this spot
      const futureEntry = directoryMap.get(futureTenantFromMap.tenantCode);
      futureTenantCode = futureTenantFromMap.tenantCode;
      futureTenantName = futureEntry?.residentName || (futureTenantFromMap.tenantCode ? `(${futureTenantFromMap.tenantCode})` : null);
      futureUnitNumber = futureEntry?.unitNumber || null;
      effectiveFutureStartDate = futureTenantFromMap.leaseStartDate;
      hasFutureTenant = true;
    }
    
    // If spot already exists in map (shouldn't happen often), merge or skip
    if (spotMap.has(fullSpaceCode)) {
      // Keep the non-Future record, but make sure future tenant info is preserved
      const existingSpot = spotMap.get(fullSpaceCode)!;
      if (hasFutureTenant && !existingSpot.has_future_tenant) {
        existingSpot.future_tenant_code = futureTenantCode;
        existingSpot.future_tenant_name = futureTenantName;
        existingSpot.future_unit_number = futureUnitNumber;
        existingSpot.future_start_date = effectiveFutureStartDate;
        existingSpot.has_future_tenant = true;
      }
      continue;
    }
    
    spotMap.set(fullSpaceCode, {
      id: fullSpaceCode,
      property,
      spot_type: spotType,
      spot_number: spotNumber,
      full_space_code: fullSpaceCode,
      monthly_rent: monthlyRent,
      status,
      tenant_code: effectiveTenantCode,
      tenant_name: tenantName,
      unit_number: unitNumber,
      lease_start_date: currentLeaseIsFuture ? null : leaseStartDate,
      termination_date: terminationDate,
      available_date: effectiveAvailableDate,
      has_ev_charging: hasEvCharging,
      is_handicap: isHandicap,
      space_size: spaceSize,
      future_tenant_code: futureTenantCode,
      future_tenant_name: futureTenantName,
      future_unit_number: futureUnitNumber,
      future_start_date: effectiveFutureStartDate,
      has_future_tenant: hasFutureTenant,
      reservation_id: null,
      reserved_for_applicant: null,
      reserved_for_unit: null,
      reservation_date: null,
      expected_move_in: null,
    });
  }
  
  return Array.from(spotMap.values());
}

// Fetch active reservations from Supabase
async function fetchReservations(): Promise<ParkingReservation[]> {
  try {
    const { data, error } = await supabase
      .from('parking_reservations')
      .select('*')
      .eq('status', 'active');
    
    if (error) {
      console.error('Error fetching reservations:', error);
      return [];
    }
    
    return data || [];
  } catch (error) {
    console.error('Error in fetchReservations:', error);
    return [];
  }
}

export async function GET() {
  try {
    // Fetch directory first for tenant name lookups
    const directoryMap = await fetchDirectory();
    const spots = await fetchParkingSpots(directoryMap);
    
    // Fetch active reservations and merge with spots
    const reservations = await fetchReservations();
    const reservationMap = new Map(reservations.map(r => [r.full_space_code, r]));
    
    // Apply reservations to spots (or auto-convert if tenant already exists)
    console.log('Active reservations:', reservations.map(r => ({ full_space_code: r.full_space_code, applicant: r.applicant_name })));
    
    const reservationsToConvert: string[] = [];
    
    for (const spot of spots) {
      const reservation = reservationMap.get(spot.full_space_code);
      if (reservation) {
        console.log(`Match found: spot ${spot.full_space_code} -> reservation for ${reservation.applicant_name}`);
        
        // Check if spot now has a tenant or future tenant (applicant became tenant)
        const hasTenant = spot.tenant_code || spot.future_tenant_code;
        
        if (hasTenant) {
          // Tenant exists - auto-convert reservation (don't show as Reserved)
          console.log(`Auto-converting reservation: ${spot.full_space_code} now has tenant ${spot.tenant_code || spot.future_tenant_code}`);
          reservationsToConvert.push(reservation.id);
          // Don't apply reservation info - let the actual tenant data drive the status
          continue;
        }
        
        // No tenant yet - apply reservation info
        // For Vacant spots: change status to Reserved
        if (spot.status === 'Vacant') {
          spot.status = 'Reserved';
        }
        // For both Vacant and Notice spots: add reservation info
        if (spot.status === 'Reserved' || spot.status === 'Notice') {
          spot.reservation_id = reservation.id;
          spot.reserved_for_applicant = reservation.applicant_name;
          spot.reserved_for_unit = reservation.unit_number;
          spot.reservation_date = reservation.reservation_date;
          spot.expected_move_in = reservation.expected_move_in;
        }
      }
    }
    
    // Auto-convert reservations where tenant now exists
    if (reservationsToConvert.length > 0) {
      console.log(`Auto-converting ${reservationsToConvert.length} reservations`);
      for (const reservationId of reservationsToConvert) {
        await supabase
          .from('parking_reservations')
          .update({ status: 'converted', converted_at: new Date().toISOString() })
          .eq('id', reservationId);
      }
    }
    
    // Log sample spots for Countryside C for debugging
    const countrysideSpots = spots.filter(s => s.property.includes('Countryside C'));
    console.log('Countryside C spots sample:', countrysideSpots.slice(0, 5).map(s => s.full_space_code));
    
    // Calculate stats
    const totalSpots = spots.length;
    const occupiedSpots = spots.filter(s => s.status === 'Occupied').length;
    const vacantSpots = spots.filter(s => s.status === 'Vacant').length;
    const noticeSpots = spots.filter(s => s.status === 'Notice').length;
    const reservedSpots = spots.filter(s => s.status === 'Reserved').length;
    const futureSpots = spots.filter(s => s.status === 'Future').length;
    
    // Get unique properties
    const properties = [...new Set(spots.map(s => s.property))].sort();
    
    // Calculate stats by property
    const statsByProperty: Record<string, { total: number; occupied: number; vacant: number; notice: number }> = {};
    for (const spot of spots) {
      if (!statsByProperty[spot.property]) {
        statsByProperty[spot.property] = { total: 0, occupied: 0, vacant: 0, notice: 0 };
      }
      statsByProperty[spot.property].total++;
      if (spot.status === 'Occupied') statsByProperty[spot.property].occupied++;
      if (spot.status === 'Vacant') statsByProperty[spot.property].vacant++;
      if (spot.status === 'Notice') statsByProperty[spot.property].notice++;
    }
    
    return NextResponse.json({
      success: true,
      spots,
      stats: {
        total: totalSpots,
        occupied: occupiedSpots,
        vacant: vacantSpots,
        notice: noticeSpots,
        reserved: reservedSpots,
        future: futureSpots,
      },
      properties,
      statsByProperty,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Parking API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch parking data', details: String(error) },
      { status: 500 }
    );
  }
}
