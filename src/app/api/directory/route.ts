import { authorize } from '@/lib/api-auth';
import { NextResponse } from 'next/server';
import { normalizeParkingProperty } from '@/lib/parking-matching';

const PARKING_SPREADSHEET_ID = '1w78XH8yuyuoZm_l1PtHIFzXygwEjS56lV0rZwEQvNwM';

interface DirectoryEntry {
  tenantCode: string;
  residentName: string;
  unitNumber?: string;
  property?: string;
  status?: string;
}

// Title case property names: "WEST MONTROSE" -> "West Montrose"
function titleCaseProperty(name: string): string {
  return name
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

async function fetchDirectory(): Promise<DirectoryEntry[]> {
  // Target the Directory sheet
  const url = `https://docs.google.com/spreadsheets/d/${PARKING_SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=Directory`;
  const response = await fetch(url, { cache: 'no-store' });
  const text = await response.text();
  const jsonStr = text.replace(/^[^(]*\(/, '').replace(/\);?$/, '');
  const data = JSON.parse(jsonStr);
  
  const entries: DirectoryEntry[] = [];
  
  // Data starts from the first row (Google Sheets API already excludes header)
  const rows = data.table.rows;
  
  for (const row of rows) {
    const cells = row.c;
    if (!cells) continue;
    
    // Column B (index 1) = Unit Number, Column C (index 2) = Tenant Code, 
    // Column D (index 3) = Resident Name, Column I (index 8) = Status,
    // Column R (index 17) = Property, Column S (index 18) = Unique ID
    let unitNumber = readUnitCell(cells[1]);
    const tenantCode = cells[2]?.v?.toString() || '';
    const residentName = cells[3]?.v?.toString() || '';
    const status = cells[8]?.v?.toString() || '';
    let propertyRaw = cells[17]?.v?.toString() || '';
    const uniqueId = cells[18]?.v?.toString() || '';
    
    // Skip past tenants - only include Current, Future, and Notice
    const activeStatuses = ['current', 'future', 'notice'];
    if (!activeStatuses.includes(status.toLowerCase())) continue;
    
    // Skip rows without both code and name
    if (!tenantCode || !residentName) continue;

    // Google Sheets types column B as a number, so text units like "8467-102" or "3440-G1"
    // come back empty. Fall back to the unit in the Unique ID: "gb546 8467-102" -> "8467-102"
    if (!unitNumber && uniqueId) {
      const parts = uniqueId.trim().split(/\s+/);
      if (parts.length >= 2) {
        unitNumber = parts.slice(1).join(' ');
      }
    }
    
    // For Green Bay properties, we ALWAYS need to extract from unique ID to get the building number
    // because the property column might just say "Green Bay" without 246/440/546
    // Formats: "gb440 607", "gb246 5", "gb546 101" OR "green bay 440-12"
    if (uniqueId) {
      const greenBayMatch = uniqueId.match(/(?:green\s*bay|gb)\s*(\d{3})/i);
      if (greenBayMatch) {
        propertyRaw = `Green Bay ${greenBayMatch[1]}`;
      } else if (!propertyRaw) {
        // Only extract generic property from unique ID if column R is empty
        const match = uniqueId.match(/^([a-zA-Z\s]+)/);
        if (match) {
          propertyRaw = match[1].trim();
        }
      }
    }
    
    // Debug logging for Green Bay tenants
    if (uniqueId && uniqueId.toLowerCase().includes('green') || residentName.toLowerCase().includes('bang')) {
      console.log(`Directory entry: ${residentName}, propertyCol: "${cells[17]?.v}", uniqueId: "${uniqueId}", final property: "${propertyRaw}"`);
    }
    
    // Title case the property name
    const property = propertyRaw ? normalizeParkingProperty(titleCaseProperty(propertyRaw)) : undefined;
    
    entries.push({
      tenantCode,
      residentName,
      unitNumber: unitNumber || undefined,
      property,
      status: status || undefined,
    });
  }
  
  return entries;
}

// Sheets turns units like "3647-3" into dates; gviz then sends a serial number (638140) as v and "3647-3" as f
const readUnitCell = (cell: { v?: unknown; f?: string } | null | undefined): string => {
  const formatted = cell?.f?.toString() || '';
  if (formatted && /[-A-Za-z]/.test(formatted)) return formatted;
  return cell?.v?.toString() || formatted;
};

export async function GET(request: Request) {
  const caller = await authorize(request);
  if (caller instanceof NextResponse) return caller;

  try {
    const directory = await fetchDirectory();
    
    // Get unique properties if available
    const properties = [...new Set(directory.filter(d => d.property).map(d => d.property))].sort();
    
    return NextResponse.json({
      directory,
      properties,
      count: directory.length,
    });
  } catch (error) {
    console.error('Error fetching directory:', error);
    return NextResponse.json(
      { error: 'Failed to fetch directory' },
      { status: 500 }
    );
  }
}
