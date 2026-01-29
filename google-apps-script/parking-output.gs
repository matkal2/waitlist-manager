/**
 * Google Apps Script for Parking Change Requests
 * 
 * SETUP INSTRUCTIONS:
 * 1. Open your Google Sheet (ID: 1w78XH8yuyuoZm_l1PtHIFzXygwEjS56lV0rZwEQvNwM)
 * 2. Go to Extensions → Apps Script
 * 3. Delete any existing code and paste this entire script
 * 4. Click "Deploy" → "New deployment"
 * 5. Select type: "Web app"
 * 6. Set "Execute as": "Me"
 * 7. Set "Who has access": "Anyone"
 * 8. Click "Deploy" and authorize when prompted
 * 9. Copy the Web App URL and add it to your .env file as GOOGLE_APPS_SCRIPT_URL
 */

// Configuration
const OUTPUT_TAB_NAME = 'OUTPUT';

function doPost(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(OUTPUT_TAB_NAME);
    
    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'OUTPUT tab not found in spreadsheet'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    const data = JSON.parse(e.postData.contents);
    
    // Expected columns in OUTPUT tab:
    // Type | Tenant Name | Tenant Unit | Property | Effective Date | Primary Space | Transfer To Space | Submitter | Other Notes | Submission Date
    const row = [
      data.type || '',
      data.tenantName || '',
      data.tenantUnit || '',
      data.property || '',
      data.effectiveDate || '',
      data.primarySpace || '',
      data.transferToSpace || '',
      data.submitter || '',
      data.otherNotes || '',
      data.submissionDate || new Date().toLocaleString()
    ];
    
    // Append the row to the OUTPUT tab
    sheet.appendRow(row);
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: 'Row added to OUTPUT tab',
      row: row
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  // Handle GET requests with URL parameters (more reliable for cross-origin)
  try {
    const params = e.parameter;
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(OUTPUT_TAB_NAME);
    
    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'OUTPUT tab not found'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Handle deleteRow action for reverting changes
    if (params.action === 'deleteRow') {
      const rowNumber = parseInt(params.rowNumber);
      
      if (!rowNumber || rowNumber < 2) {
        return ContentService.createTextOutput(JSON.stringify({
          success: false,
          error: 'Invalid row number'
        })).setMimeType(ContentService.MimeType.JSON);
      }
      
      // Delete the specified row
      sheet.deleteRow(rowNumber);
      
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        message: 'Row ' + rowNumber + ' deleted from OUTPUT tab'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Handle findAndDeleteRow action - find row by matching data and delete it
    if (params.action === 'findAndDeleteRow') {
      const searchType = params.type;
      const searchTenantName = params.tenantName;
      const searchPrimarySpace = params.primarySpace;
      
      if (!searchType || !searchTenantName || !searchPrimarySpace) {
        return ContentService.createTextOutput(JSON.stringify({
          success: false,
          error: 'Missing search parameters'
        })).setMimeType(ContentService.MimeType.JSON);
      }
      
      // Get all data from the sheet
      const data = sheet.getDataRange().getValues();
      let rowToDelete = -1;
      
      // Search from bottom to top (most recent first) to find matching row
      // Columns: Type(0), Tenant Name(1), Tenant Unit(2), Tenant Code(3), Property(4), 
      //          Effective Date(5), Primary Space(6), Transfer To(7), Submitter(8), Notes(9), Date(10)
      for (let i = data.length - 1; i >= 1; i--) {
        const row = data[i];
        if (row[0] === searchType && 
            row[1] === searchTenantName && 
            row[6] === searchPrimarySpace) {
          rowToDelete = i + 1; // Sheet rows are 1-indexed
          break;
        }
      }
      
      if (rowToDelete === -1) {
        return ContentService.createTextOutput(JSON.stringify({
          success: false,
          error: 'Row not found matching criteria'
        })).setMimeType(ContentService.MimeType.JSON);
      }
      
      // Delete the found row
      sheet.deleteRow(rowToDelete);
      
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        message: 'Row ' + rowToDelete + ' found and deleted from OUTPUT tab'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // If no data params, just return status
    if (!params.type) {
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        message: 'Parking Output API is running. Send data via GET params.'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Get current time in Central timezone
    const now = new Date();
    const centralTime = Utilities.formatDate(now, 'America/Chicago', 'MM/dd/yyyy hh:mm:ss a');
    
    const row = [
      params.type || '',
      params.tenantName || '',
      params.tenantUnit || '',
      params.tenantCode || '',  // Tenant Code (empty, filled from master)
      params.property || '',
      params.effectiveDate || '',
      params.primarySpace || '',
      params.transferToSpace || '',
      params.submitter || '',
      params.otherNotes || '',
      centralTime  // Date and Time in Central timezone
    ];
    
    sheet.appendRow(row);
    
    // Get the row number that was just added (for potential revert)
    const newRowNumber = sheet.getLastRow();
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: 'Row added to OUTPUT tab',
      rowNumber: newRowNumber
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// Test function - run this in Apps Script to test
function testAddRow() {
  const testData = {
    postData: {
      contents: JSON.stringify({
        type: 'Add',
        tenantName: 'Test Tenant',
        tenantUnit: '301',
        property: 'Broadway',
        effectiveDate: '01/15/2026',
        primarySpace: 'Broadway 5',
        transferToSpace: '',
        submitter: 'Test User',
        otherNotes: 'Test entry',
        submissionDate: new Date().toLocaleString()
      })
    }
  };
  
  const result = doPost(testData);
  Logger.log(result.getContent());
}
