import { NextResponse } from 'next/server';

const PARKING_SPREADSHEET_ID = '1w78XH8yuyuoZm_l1PtHIFzXygwEjS56lV0rZwEQvNwM';

export async function GET() {
  try {
    // Fetch Directory sheet
    const directoryUrl = `https://docs.google.com/spreadsheets/d/${PARKING_SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=Directory`;
    const directoryResponse = await fetch(directoryUrl, { cache: 'no-store' });
    const directoryText = await directoryResponse.text();
    const directoryJsonStr = directoryText.replace(/^[^(]*\(/, '').replace(/\);?$/, '');
    const directoryData = JSON.parse(directoryJsonStr);
    
    // Get column headers
    const cols = directoryData.table.cols.map((c: any, i: number) => ({
      index: i,
      label: c.label,
      type: c.type
    }));
    
    // Get first 20 rows with all cell data for debugging
    const sampleRows = directoryData.table.rows.slice(0, 20).map((row: any, rowIndex: number) => {
      const cells: Record<string, any> = {};
      row.c?.forEach((cell: any, cellIndex: number) => {
        cells[`col_${cellIndex}`] = {
          value: cell?.v,
          formatted: cell?.f
        };
      });
      return { rowIndex, cells };
    });
    
    // Look for Elston entries specifically (check project col_17)
    const elstonEntries = directoryData.table.rows
      .filter((row: any) => {
        const project = row.c?.[17]?.v || '';
        return project.toString().toLowerCase().includes('elston');
      })
      .slice(0, 10)
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
      elstonEntries,
      totalRows: directoryData.table.rows.length
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
