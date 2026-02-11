import { NextResponse } from 'next/server';

const PARKING_SPREADSHEET_ID = '1w78XH8yuyuoZm_l1PtHIFzXygwEjS56lV0rZwEQvNwM';

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
  
  const spots: ParkingSpot[] = [];
  
  // Skip header rows (first 2 rows based on data structure)
  const rows = data.table.rows.slice(2);
  
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
    
    const rawStatus = normalizeStatus(statusRaw);
    const terminationDate = parseGoogleDate(terminationDateRaw);
    const availableDate = parseGoogleDate(availableDateRaw);
    const leaseStartDate = parseGoogleDate(leaseStartDateRaw);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Check if the current tenant's lease starts in the future
    const currentLeaseIsFuture = leaseStartDate && tenantCode && new Date(leaseStartDate) > today;
    
    // Determine future tenant info - only when lease starts in the future
    let futureTenantCode: string | null = null;
    let futureTenantName: string | null = null;
    let futureUnitNumber: string | null = null;
    let effectiveFutureStartDate: string | null = null;
    let hasFutureTenant = false;
    
    // If current tenant's lease starts in the future, treat them as future tenant
    if (currentLeaseIsFuture) {
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
    
    spots.push({
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
    });
  }
  
  return spots;
}

export async function GET() {
  try {
    // Fetch directory first for tenant name lookups
    const directoryMap = await fetchDirectory();
    const spots = await fetchParkingSpots(directoryMap);
    
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
