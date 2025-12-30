import { NextResponse } from 'next/server';

const SPREADSHEET_ID = '1OTm2nalt3DUBPzM_kQ4ZmiO0cs0dLUC2o72DYgoRA0U';

export async function GET() {
  try {
    // Specify the DASH sheet explicitly
    const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=DASH`;
    
    const response = await fetch(url, { cache: 'no-store' });
    
    if (!response.ok) {
      throw new Error('Failed to fetch spreadsheet');
    }
    
    const text = await response.text();
    const jsonStr = text.replace(/^[^(]*\(/, '').replace(/\);?$/, '');
    const data = JSON.parse(jsonStr);
    
    // Get column headers
    const cols = data.table.cols.map((c: any, i: number) => ({
      index: i,
      label: c.label,
      type: c.type
    }));
    
    // Get first 5 rows with all cell data for debugging
    const sampleRows = data.table.rows.slice(0, 10).map((row: any, rowIndex: number) => {
      const cells: Record<string, any> = {};
      row.c?.forEach((cell: any, cellIndex: number) => {
        cells[`col_${cellIndex}`] = {
          value: cell?.v,
          formatted: cell?.f,
          raw: cell
        };
      });
      return { rowIndex, cells };
    });
    
    // Find Greenleaf rows specifically
    const greenleafRows = data.table.rows
      .filter((row: any) => {
        const property = row.c?.[0]?.v || '';
        return property.toLowerCase().includes('greenleaf');
      })
      .map((row: any) => {
        const cells: Record<string, any> = {};
        row.c?.forEach((cell: any, cellIndex: number) => {
          cells[`col_${cellIndex}`] = {
            value: cell?.v,
            formatted: cell?.f
          };
        });
        return cells;
      });
    
    return NextResponse.json({
      success: true,
      columns: cols,
      sampleRows,
      greenleafRows,
      totalRows: data.table.rows.length
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
