import {
  groupByProperty, portfolioSummary, reportFileName, sortBySpaceCode, spotFeatures, spotLabel, summarize,
  type PropertySummary, type ReportSpot,
} from '@/lib/parking-report';

// Builds a workbook with a Summary sheet and one filterable Spots sheet; pass propertyName = null for the full portfolio
export async function exportParkingToExcel(
  spots: ReportSpot[],
  propertyName: string | null,
  waitlistByProperty: Record<string, number> = {}
) {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Highpoint Living Hub';
  workbook.created = new Date();

  const groups = groupByProperty(spots);
  const properties = propertyName ? [propertyName] : Object.keys(groups).sort();
  const rows = properties.map(p => summarize(p, groups[p] || [], waitlistByProperty[p] || 0));

  const summary = workbook.addWorksheet('Summary', { views: [{ state: 'frozen', ySplit: 1 }] });
  summary.columns = [
    { header: 'Property', key: 'property', width: 28 },
    { header: 'Total Spots', key: 'total', width: 12 },
    { header: 'Indoor', key: 'indoor', width: 10 },
    { header: 'Outdoor', key: 'outdoor', width: 10 },
    { header: 'Occupied', key: 'occupied', width: 11 },
    { header: 'Vacant', key: 'vacant', width: 10 },
    { header: 'Notice', key: 'notice', width: 10 },
    { header: 'Reserved / Future', key: 'reservedOrFuture', width: 17 },
    { header: 'Occupancy', key: 'occupancy', width: 12 },
    { header: 'On Waitlist', key: 'waitlist', width: 12 },
  ];
  const addSummaryRow = (r: PropertySummary) => summary.addRow({ ...r, occupancy: r.occupancyRate / 100 });
  rows.forEach(addSummaryRow);
  if (!propertyName) addSummaryRow(portfolioSummary(rows)).font = { bold: true };
  summary.getColumn('occupancy').numFmt = '0%';
  summary.getRow(1).font = { bold: true };

  const sheet = workbook.addWorksheet('Spots', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = [
    { header: 'Property', key: 'property', width: 24 },
    { header: 'Spot', key: 'spot', width: 8 },
    { header: 'Space Code', key: 'code', width: 16 },
    { header: 'Type', key: 'type', width: 10 },
    { header: 'Status', key: 'status', width: 11 },
    { header: 'Unit', key: 'unit', width: 10 },
    { header: 'Tenant', key: 'tenant', width: 26 },
    { header: 'Tenant Code', key: 'tenantCode', width: 13 },
    { header: 'Monthly Rent', key: 'rent', width: 13 },
    { header: 'Termination Date', key: 'termination', width: 16 },
    { header: 'Available Date', key: 'available', width: 15 },
    { header: 'Features', key: 'features', width: 10 },
  ];
  properties.forEach(p => {
    [...(groups[p] || [])].sort(sortBySpaceCode).forEach(spot => {
      sheet.addRow({
        property: spot.property,
        spot: spotLabel(spot),
        code: spot.full_space_code || '',
        type: spot.spot_type || '',
        status: spot.status || '',
        unit: spot.unit_number || '',
        tenant: spot.tenant_name || '',
        tenantCode: spot.tenant_code || '',
        rent: spot.monthly_rent || null,
        termination: spot.termination_date || '',
        available: spot.available_date || '',
        features: spotFeatures(spot),
      });
    });
  });
  sheet.getColumn('rent').numFmt = '$#,##0';
  sheet.getRow(1).font = { bold: true };
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } };

  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = reportFileName(propertyName, 'xlsx');
  link.click();
  URL.revokeObjectURL(url);
}
