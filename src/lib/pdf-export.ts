import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ParkingSpot {
  property: string;
  spot_number: string;
  full_space_code: string;
  spot_type: string;
  status: string;
  tenant_code: string | null;
  tenant_name: string | null;
  unit_number: string | null;
  monthly_rent: number;
  available_date: string | null;
  termination_date: string | null;
  has_ev_charging: boolean;
  is_handicap: boolean;
}

export function exportParkingToPDF(
  spots: ParkingSpot[],
  propertyName: string | null,
  allProperties: boolean = false
) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  // Professional color palette - minimal, clean
  const colors = {
    primary: [51, 51, 51] as [number, number, number],      // Dark gray for text
    secondary: [120, 120, 120] as [number, number, number], // Medium gray
    light: [245, 245, 245] as [number, number, number],     // Light gray background
    border: [200, 200, 200] as [number, number, number],    // Border gray
    white: [255, 255, 255] as [number, number, number],
  };
  
  // Group spots by property
  const spotsByProperty: Record<string, ParkingSpot[]> = {};
  spots.forEach(spot => {
    if (!spotsByProperty[spot.property]) {
      spotsByProperty[spot.property] = [];
    }
    spotsByProperty[spot.property].push(spot);
  });

  const propertiesToExport = allProperties 
    ? Object.keys(spotsByProperty).sort()
    : propertyName 
      ? [propertyName]
      : [];

  let isFirstPage = true;

  propertiesToExport.forEach((property, propIndex) => {
    const propertySpots = spotsByProperty[property] || [];
    
    if (!isFirstPage) {
      doc.addPage();
    }
    isFirstPage = false;

    let yPosition = 20;

    // Header - Clean line design
    doc.setDrawColor(colors.primary[0], colors.primary[1], colors.primary[2]);
    doc.setLineWidth(0.5);
    doc.line(14, 12, pageWidth - 14, 12);
    
    // Title
    doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('PARKING INVENTORY', 14, 22);
    
    // Property name
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(property, 14, 30);
    
    // Date - right aligned
    doc.setFontSize(9);
    doc.setTextColor(colors.secondary[0], colors.secondary[1], colors.secondary[2]);
    doc.text(new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    }), pageWidth - 14, 22, { align: 'right' });

    // Underline
    doc.setDrawColor(colors.border[0], colors.border[1], colors.border[2]);
    doc.setLineWidth(0.3);
    doc.line(14, 35, pageWidth - 14, 35);

    yPosition = 45;

    // Stats summary - clean text layout
    const occupied = propertySpots.filter(s => s.status === 'Occupied').length;
    const vacant = propertySpots.filter(s => s.status === 'Vacant').length;
    const notice = propertySpots.filter(s => s.status === 'Notice').length;
    const indoor = propertySpots.filter(s => s.spot_type === 'Indoor').length;
    const outdoor = propertySpots.filter(s => s.spot_type === 'Outdoor').length;
    const occupancyRate = propertySpots.length > 0 
      ? Math.round((occupied / propertySpots.length) * 100) 
      : 0;

    // Summary section with subtle background
    doc.setFillColor(colors.light[0], colors.light[1], colors.light[2]);
    doc.roundedRect(14, yPosition, pageWidth - 28, 28, 2, 2, 'F');
    
    doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('SUMMARY', 20, yPosition + 8);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const summaryLine1 = `Total: ${propertySpots.length}    |    Occupied: ${occupied}    |    Vacant: ${vacant}    |    Notice: ${notice}    |    Occupancy: ${occupancyRate}%`;
    const summaryLine2 = `Indoor: ${indoor}    |    Outdoor: ${outdoor}`;
    
    doc.text(summaryLine1, 20, yPosition + 17);
    doc.setTextColor(colors.secondary[0], colors.secondary[1], colors.secondary[2]);
    doc.text(summaryLine2, 20, yPosition + 24);

    yPosition += 38;

    // Table - use full_space_code as primary identifier since spot_number may be empty for some properties
    const tableData = propertySpots
      .sort((a, b) => {
        // Sort by full_space_code which is more reliable
        const codeA = a.full_space_code || '';
        const codeB = b.full_space_code || '';
        return codeA.localeCompare(codeB, undefined, { numeric: true });
      })
      .map(spot => [
        spot.spot_number || spot.full_space_code?.split('-').pop() || '—',
        spot.full_space_code || '—',
        spot.spot_type || '—',
        spot.status || '—',
        spot.unit_number || '—',
        spot.tenant_code 
          ? (spot.tenant_name ? `${spot.tenant_name} • ${spot.tenant_code}` : spot.tenant_code)
          : '—',
        spot.monthly_rent ? `$${spot.monthly_rent}` : '—',
        [
          spot.has_ev_charging ? 'EV' : '',
          spot.is_handicap ? 'HC' : ''
        ].filter(Boolean).join(', ') || '—'
      ]);

    autoTable(doc, {
      startY: yPosition,
      head: [['Spot', 'Code', 'Type', 'Status', 'Unit', 'Tenant', 'Rent', 'Notes']],
      body: tableData,
      theme: 'plain',
      headStyles: {
        fillColor: colors.white,
        textColor: colors.primary,
        fontStyle: 'bold',
        fontSize: 8,
        cellPadding: 4,
      },
      bodyStyles: {
        fontSize: 8,
        textColor: colors.primary,
        cellPadding: 3,
      },
      alternateRowStyles: {
        fillColor: [250, 250, 250],
      },
      columnStyles: {
        0: { cellWidth: 14 },
        1: { cellWidth: 24 },
        2: { cellWidth: 16 },
        3: { cellWidth: 16 },
        4: { cellWidth: 14 },
        5: { cellWidth: 48 },
        6: { cellWidth: 16 },
        7: { cellWidth: 16 },
      },
      styles: {
        lineColor: colors.border,
        lineWidth: 0.2,
      },
      tableLineColor: colors.border,
      tableLineWidth: 0.2,
      margin: { left: 14, right: 14 },
      didParseCell: (data) => {
        // Add top border to header
        if (data.section === 'head') {
          data.cell.styles.lineWidth = { top: 0.5, bottom: 0.5, left: 0, right: 0 };
          data.cell.styles.lineColor = colors.primary;
        }
      },
    });

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(colors.secondary[0], colors.secondary[1], colors.secondary[2]);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Page ${propIndex + 1} of ${propertiesToExport.length}`,
      pageWidth / 2,
      pageHeight - 12,
      { align: 'center' }
    );
    
    // Bottom line
    doc.setDrawColor(colors.border[0], colors.border[1], colors.border[2]);
    doc.setLineWidth(0.3);
    doc.line(14, pageHeight - 18, pageWidth - 14, pageHeight - 18);
  });

  // Download
  const filename = allProperties 
    ? `parking-inventory-all-${new Date().toISOString().split('T')[0]}.pdf`
    : `parking-inventory-${propertyName?.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`;
  
  doc.save(filename);
}
