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
  // Format: "4027 N. Broadway \nUnit: 505" -> "505"
  const match = addressAndApt.match(/Unit:\s*(\S+)/i);
  return match ? match[1] : '';
}

export async function GET() {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json`;
    
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
      const bedrooms = cells[7]?.v || 0;
      const bathrooms = cells[8]?.v || 0;
      const sqFootage = cells[9]?.v || 0;
      const availableDateRaw = cells[10]?.v || null;
      const rentPrice = cells[11]?.v || 0;
      const uniqueId = cells[4]?.v || '';
      
      // Only include available units
      if (status !== 'Available') continue;
      
      const unit: SheetUnit = {
        property: mapPropertyName(propertyRaw),
        unit_number: extractUnitNumber(addressAndApt),
        unit_type: bedroomsToUnitType(bedrooms),
        bedrooms,
        bathrooms,
        sq_footage: sqFootage,
        available_date: parseGoogleDate(availableDateRaw),
        rent_price: rentPrice,
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
