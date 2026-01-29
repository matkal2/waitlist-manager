import { NextResponse } from 'next/server';

const SHEET_ID = '1w78XH8yuyuoZm_l1PtHIFzXygwEjS56lV0rZwEQvNwM';
const API_KEY = process.env.GOOGLE_API_KEY;

export interface Property {
  fullName: string;
  nickname: string;
  shortCode: string;
  isActive: boolean;
}

// Fallback properties in case Google Sheet doesn't have Properties tab
const FALLBACK_PROPERTIES: Property[] = [
  { fullName: 'HIGHPOINT Countryside Residences', nickname: 'Countryside C', shortCode: 'CC', isActive: true },
  { fullName: 'HIGHPOINT Countryside Townhomes', nickname: 'Countryside T', shortCode: 'CT', isActive: true },
  { fullName: 'HIGHPOINT Avondale', nickname: 'Elston', shortCode: 'EL', isActive: true },
  { fullName: 'HIGHPOINT Jefferson Park', nickname: 'Kennedy', shortCode: 'KE', isActive: true },
  { fullName: 'HIGHPOINT Lincoln Park on Clark', nickname: 'North Clark', shortCode: 'NC', isActive: true },
  { fullName: 'HIGHPOINT Clarendon Hills', nickname: 'Park', shortCode: 'PK', isActive: true },
  { fullName: 'HIGHPOINT Downers Grove on Rogers', nickname: 'Rogers', shortCode: 'RO', isActive: true },
  { fullName: 'HIGHPOINT Wicker Park', nickname: 'Talman', shortCode: 'TA', isActive: true },
  { fullName: 'HIGHPOINT Highwood Station 246', nickname: 'Green Bay 246', shortCode: 'GB246', isActive: true },
  { fullName: 'HIGHPOINT Highwood Station 440', nickname: 'Green Bay 440', shortCode: 'GB440', isActive: true },
  { fullName: 'HIGHPOINT Highwood Station 546', nickname: 'Green Bay 546', shortCode: 'GB546', isActive: true },
  { fullName: 'HIGHPOINT Wilmette', nickname: 'Greenleaf', shortCode: 'GL', isActive: true },
  { fullName: 'HIGHPOINT Barrington', nickname: 'Liberty', shortCode: 'LI', isActive: true },
  { fullName: 'HIGHPOINT Buena Park', nickname: 'Broadway', shortCode: 'BR', isActive: true },
  { fullName: 'HIGHPOINT Lincoln Park on Fullerton', nickname: 'Fullerton', shortCode: 'FU', isActive: true },
  { fullName: 'HIGHPOINT Albany Park on Kedzie', nickname: 'Kedzie', shortCode: 'KD', isActive: true },
  { fullName: 'HIGHPOINT Lakeview on Sheffield', nickname: 'Sheffield', shortCode: 'SH', isActive: true },
  { fullName: 'HIGHPOINT West Loop', nickname: 'Warren', shortCode: 'WA', isActive: true },
  { fullName: 'HIGHPOINT West Town', nickname: 'W. Chicago', shortCode: 'WC', isActive: true },
  { fullName: 'HIGHPOINT Albany Park on Montrose', nickname: 'W. Montrose', shortCode: 'WM', isActive: true },
];

async function fetchPropertiesFromSheet(): Promise<Property[]> {
  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Properties!A:D?key=${API_KEY}`;
    const response = await fetch(url, { next: { revalidate: 300 } });
    
    if (!response.ok) {
      console.log('Properties tab not found, using fallback');
      return FALLBACK_PROPERTIES;
    }

    const data = await response.json();
    const rows = data.values || [];

    if (rows.length <= 1) {
      return FALLBACK_PROPERTIES;
    }

    // Skip header row
    const properties: Property[] = rows.slice(1).map((row: string[]) => ({
      fullName: row[0] || '',
      nickname: row[1] || '',
      shortCode: row[2] || '',
      isActive: (row[3] || 'TRUE').toUpperCase() === 'TRUE',
    })).filter((p: Property) => p.fullName && p.nickname);

    return properties.length > 0 ? properties : FALLBACK_PROPERTIES;
  } catch (error) {
    console.error('Error fetching properties from sheet:', error);
    return FALLBACK_PROPERTIES;
  }
}

export async function GET() {
  try {
    const properties = await fetchPropertiesFromSheet();
    
    // Filter to only active properties by default
    const activeProperties = properties.filter(p => p.isActive);
    
    return NextResponse.json({
      success: true,
      properties: activeProperties,
      allProperties: properties,
    });
  } catch (error) {
    console.error('Error in properties API:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch properties' },
      { status: 500 }
    );
  }
}
