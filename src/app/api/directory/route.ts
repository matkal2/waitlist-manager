import { NextResponse } from 'next/server';

const PARKING_SPREADSHEET_ID = '1w78XH8yuyuoZm_l1PtHIFzXygwEjS56lV0rZwEQvNwM';

interface DirectoryEntry {
  tenantCode: string;
  residentName: string;
  unitNumber?: string;
  property?: string;
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
    // Column D (index 3) = Resident Name, Column R (index 17) = Property,
    // Column S (index 18) = Unique ID (e.g., "fullerton-413" or "vista 206")
    const unitNumber = cells[1]?.v?.toString() || cells[1]?.f?.toString() || '';
    const tenantCode = cells[2]?.v?.toString() || '';
    const residentName = cells[3]?.v?.toString() || '';
    let propertyRaw = cells[17]?.v?.toString() || '';
    const uniqueId = cells[18]?.v?.toString() || '';
    
    // Skip rows without both code and name
    if (!tenantCode || !residentName) continue;
    
    // For Green Bay properties, we ALWAYS need to extract from unique ID to get the building number
    // because the property column might just say "Green Bay" without 246/440/546
    if (uniqueId) {
      const greenBayMatch = uniqueId.match(/green\s*bay\s*(\d{3})/i);
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
    const property = propertyRaw ? titleCaseProperty(propertyRaw) : undefined;
    
    entries.push({
      tenantCode,
      residentName,
      unitNumber: unitNumber || undefined,
      property,
    });
  }
  
  return entries;
}

export async function GET() {
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
