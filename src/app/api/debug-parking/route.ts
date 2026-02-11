import { NextResponse } from 'next/server';

const PARKING_SPREADSHEET_ID = '1w78XH8yuyuoZm_l1PtHIFzXygwEjS56lV0rZwEQvNwM';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const checkImport = searchParams.get('import') === 'true';
    
    // Optionally fetch Import sheet to see parking data
    if (checkImport) {
      const importUrl = `https://docs.google.com/spreadsheets/d/${PARKING_SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=Import`;
      const importResponse = await fetch(importUrl, { cache: 'no-store' });
      const importText = await importResponse.text();
      const importJsonStr = importText.replace(/^[^(]*\(/, '').replace(/\);?$/, '');
      const importData = JSON.parse(importJsonStr);
      
      // Get columns
      const importCols = importData.table.cols.map((c: any, i: number) => ({
        index: i,
        label: c.label,
        type: c.type
      }));
      
      // Find rows for Warren, West Montrose, West Chicago
      const findImportByProperty = (searchTerm: string) => {
        return importData.table.rows
          .filter((row: any) => {
            const property = row.c?.[0]?.v || '';
            return property.toString().toLowerCase().includes(searchTerm.toLowerCase());
          })
          .slice(0, 5)
          .map((row: any) => {
            const cells: Record<string, any> = {};
            row.c?.forEach((cell: any, cellIndex: number) => {
              // Show key columns: 0-5 (property/spot), 17 (status), 19-25 (tenant/date info)
              if (cellIndex <= 5 || (cellIndex >= 17 && cellIndex <= 25)) {
                cells[`col_${cellIndex}`] = {
                  value: cell?.v,
                  formatted: cell?.f
                };
              }
            });
            return cells;
          });
      };
      
      return NextResponse.json({
        success: true,
        importColumns: importCols.slice(0, 10),
        warren: findImportByProperty('warren'),
        westMontrose: findImportByProperty('montrose'),
        westChicago: findImportByProperty('chicago'),
        totalRows: importData.table.rows.length
      });
    }
    
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
    
    // Look for specific properties (check project col_17)
    const findEntriesByProject = (searchTerm: string) => {
      return directoryData.table.rows
        .filter((row: any) => {
          const project = row.c?.[17]?.v || '';
          return project.toString().toLowerCase().includes(searchTerm.toLowerCase());
        })
        .slice(0, 5)
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
    };
    
    // Get all unique project names
    const allProjects = new Set<string>();
    directoryData.table.rows.forEach((row: any) => {
      const project = row.c?.[17]?.v?.toString() || '';
      if (project) allProjects.add(project);
    });
    
    // Search for specific tenant codes
    const findByTenantCode = (code: string) => {
      return directoryData.table.rows.find((row: any) => {
        const tenantCode = row.c?.[2]?.v?.toString() || '';
        return tenantCode === code;
      });
    };
    
    // Check if Warren/WestMontrose/WestChicago tenant codes exist
    // Also check tenant codes that ARE in Directory for Warren
    const tenantCodeLookups = {
      't0001041_warren_parking': findByTenantCode('t0001041'),
      't0001149_warren_parking': findByTenantCode('t0001149'),
      't0001294_warren_parking': findByTenantCode('t0001294'),
      't0000492_warren_directory': findByTenantCode('t0000492'),
      't0000547_westMontrose': findByTenantCode('t0000547'),
      't0000551_westMontrose': findByTenantCode('t0000551'),
    };
    
    const tenantCodeResults: Record<string, any> = {};
    for (const [key, row] of Object.entries(tenantCodeLookups)) {
      if (row) {
        tenantCodeResults[key] = {
          project: row.c?.[17]?.v,
          unitNumber: row.c?.[1]?.v,
          uniqueId: row.c?.[18]?.v,
          residentName: row.c?.[3]?.v
        };
      } else {
        tenantCodeResults[key] = null;
      }
    }
    
    return NextResponse.json({
      success: true,
      columns: cols,
      sampleRows,
      allProjects: Array.from(allProjects).sort(),
      tenantCodeLookups: tenantCodeResults,
      warren: findEntriesByProject('warren'),
      westMontrose: findEntriesByProject('montrose'),
      westChicago: findEntriesByProject('chicago'),
      elston: findEntriesByProject('elston'),
      totalRows: directoryData.table.rows.length
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
