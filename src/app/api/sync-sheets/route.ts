import { NextResponse } from 'next/server';

const SPREADSHEET_ID = '1OTm2nalt3DUBPzM_kQ4ZmiO0cs0dLUC2o72DYgoRA0U';

interface SheetUnit {
  property: string;
  unit_number: string;
  unit_type: string;
  bedrooms: number;
  bathrooms: number;
  sq_footage: number;
  available_date: string | null;
  rent_price: number;
  status: string;
  address: string;
  unique_id: string;
}

function parseGoogleDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  // Format: "Date(2026,1,1)" -> "2026-02-01" (month is 0-indexed)
  const match = dateStr.match(/Date\((\d+),(\d+),(\d+)\)/);
  if (match) {
    const year = parseInt(match[1]);
    const month = parseInt(match[2]) + 1; // 0-indexed to 1-indexed
    const day = parseInt(match[3]);
    return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  }
  // Handle other date formats (e.g., "2/15/2026" or "02/15/2026")
  const slashMatch = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slashMatch) {
    const month = parseInt(slashMatch[1]);
    const day = parseInt(slashMatch[2]);
    const year = parseInt(slashMatch[3]);
    return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  }
  return null;
}

function parseRentPrice(rentStr: string | number | null): number {
  if (rentStr === null || rentStr === undefined) return 0;
  if (typeof rentStr === 'number') return rentStr;
  // Remove $, commas, and any other non-numeric characters except decimal point
  const cleaned = String(rentStr).replace(/[$,]/g, '');
  return parseFloat(cleaned) || 0;
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

function bedroomsToUnitType(bedrooms: number | string | null): string {
  // Handle string values like "3BD + Den"
  if (typeof bedrooms === 'string') {
    const match = bedrooms.match(/(\d+)/);
    if (match) {
      const num = parseInt(match[1]);
      if (num === 0) return 'Studio';
      return `${num}BR`;
    }
    // Check for specific patterns
    if (bedrooms.toLowerCase().includes('studio')) return 'Studio';
    return bedrooms; // Return as-is if can't parse
  }
  
  // Handle numeric values
  if (bedrooms === null || bedrooms === undefined || bedrooms === 0) return 'Studio';
  return `${bedrooms}BR`;
}

function extractUnitNumber(addressAndApt: string): string {
  // Format: "4027 N. Broadway \nUnit: 505" -> "505"
  const match = addressAndApt.match(/Unit:\s*(\S+)/i);
  return match ? match[1] : '';
}

export async function GET() {
  try {
    // Specify the DASH sheet explicitly
    const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=DASH`;
    
    const response = await fetch(url, { 
      next: { revalidate: 60 } // Cache for 60 seconds
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch spreadsheet');
    }
    
    const text = await response.text();
    // Remove the google.visualization wrapper
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
      const bathrooms = cells[8]?.v || 0;
      const sqFootage = cells[9]?.v || 0;
      const availableDateRaw = cells[10]?.v || cells[10]?.f || null;
      const rentPriceRaw = cells[11]?.v || cells[11]?.f || 0;
      const uniqueId = cells[4]?.v || '';
      
      // Look for unit type in multiple possible columns
      // Check col 13, 14, 15, 16, 17 for any text containing "BD" or bedroom info
      let unitTypeRaw: string | null = null;
      for (let i = 12; i <= 20; i++) {
        const cellVal = cells[i]?.v || cells[i]?.f;
        if (cellVal && typeof cellVal === 'string' && (cellVal.includes('BD') || cellVal.includes('BR') || cellVal.includes('Studio'))) {
          unitTypeRaw = cellVal;
          break;
        }
      }
      // Also check formatted value of bedrooms column
      if (!unitTypeRaw && cells[7]?.f && typeof cells[7].f === 'string') {
        unitTypeRaw = cells[7].f;
      }
      
      // Only include available units
      if (status !== 'Available') continue;
      
      // Use unitTypeRaw if it contains text like "3BD + Den", otherwise use bedrooms number
      let finalUnitType: string;
      if (unitTypeRaw && typeof unitTypeRaw === 'string' && (unitTypeRaw.includes('BD') || unitTypeRaw.includes('BR') || unitTypeRaw.includes('Den'))) {
        finalUnitType = unitTypeRaw;
      } else if (bedrooms && bedrooms > 0) {
        finalUnitType = bedroomsToUnitType(bedrooms);
      } else {
        // Fallback: infer from square footage if bedrooms is missing
        // This handles cases where the bedrooms cell is empty but we have size data
        if (sqFootage >= 1800) {
          finalUnitType = '3BR'; // Large units (1800+ sqft) are likely 3BR+
        } else if (sqFootage >= 1000) {
          finalUnitType = '2BR';
        } else if (sqFootage >= 600) {
          finalUnitType = '1BR';
        } else {
          finalUnitType = 'Studio';
        }
      }
      
      const unit: SheetUnit = {
        property: mapPropertyName(propertyRaw),
        unit_number: extractUnitNumber(addressAndApt),
        unit_type: finalUnitType,
        bedrooms: typeof bedrooms === 'number' ? bedrooms : parseInt(String(bedrooms)) || 0,
        bathrooms,
        sq_footage: sqFootage,
        available_date: parseGoogleDate(availableDateRaw),
        rent_price: parseRentPrice(rentPriceRaw),
        status: 'Available',
        address: addressAndApt.split('\n')[0] || '',
        unique_id: uniqueId,
      };
      
      units.push(unit);
    }
    
    return NextResponse.json({
      success: true,
      count: units.length,
      units,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching spreadsheet:', error);
    return NextResponse.json(
      { error: 'Failed to fetch spreadsheet data' },
      { status: 500 }
    );
  }
}
