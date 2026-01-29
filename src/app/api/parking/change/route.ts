import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Google Apps Script Web App URL for writing to OUTPUT tab
const GOOGLE_APPS_SCRIPT_URL = process.env.GOOGLE_APPS_SCRIPT_URL;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface ParkingChangeRequest {
  type: string;
  tenantName: string;
  tenantCode?: string;
  tenantUnit: string;
  property: string;
  effectiveDate: string;
  primarySpace: string;
  transferToSpace?: string;
  submitter: string;
  otherNotes?: string;
  date: string;
}

export async function POST(request: Request) {
  try {
    const body: ParkingChangeRequest = await request.json();

    // Validate required fields
    if (!body.type || !body.tenantName || !body.tenantUnit || !body.effectiveDate || !body.primarySpace || !body.property) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Format effective date for display (MM/DD/YYYY)
    const effectiveDateFormatted = new Date(body.effectiveDate).toLocaleDateString('en-US');
    const submissionDate = new Date().toLocaleString('en-US');

    // Write to Google Sheets OUTPUT tab via Apps Script
    let sheetWriteSuccess = false;
    let sheetError = null;
    let sheetRowNumber: number | null = null;

    if (GOOGLE_APPS_SCRIPT_URL) {
      try {
        // Use GET with URL parameters - more reliable for cross-origin Apps Script calls
        const params = new URLSearchParams({
          type: body.type,
          tenantName: body.tenantName,
          tenantCode: body.tenantCode || '',
          tenantUnit: body.tenantUnit,
          property: body.property,
          effectiveDate: effectiveDateFormatted,
          primarySpace: body.primarySpace,
          transferToSpace: body.transferToSpace || '',
          submitter: body.submitter,
          otherNotes: body.otherNotes || '',
          submissionDate: submissionDate,
        });

        const url = `${GOOGLE_APPS_SCRIPT_URL}?${params.toString()}`;
        console.log('Calling Google Apps Script:', url.substring(0, 100) + '...');
        
        const sheetResponse = await fetch(url, {
          method: 'GET',
          redirect: 'follow',
        });

        const responseText = await sheetResponse.text();
        console.log('Google Sheets response:', responseText);
        
        try {
          const sheetResult = JSON.parse(responseText);
          sheetWriteSuccess = sheetResult.success;
          // Capture the row number from the response for potential revert
          if (sheetResult.rowNumber) {
            sheetRowNumber = sheetResult.rowNumber;
          }
          if (!sheetWriteSuccess) {
            sheetError = sheetResult.error;
          }
        } catch {
          // If response isn't JSON, check if it contains success indicators
          sheetWriteSuccess = responseText.includes('success') || sheetResponse.ok;
          if (!sheetWriteSuccess) {
            sheetError = responseText;
          }
        }
      } catch (err) {
        console.error('Google Sheets write error:', err);
        sheetError = String(err);
      }
    } else {
      console.warn('GOOGLE_APPS_SCRIPT_URL not configured - skipping sheet write');
    }

    // Also store in Supabase parking_changes table as backup
    const { data, error } = await supabase
      .from('parking_changes')
      .insert({
        type: body.type,
        tenant_name: body.tenantName,
        tenant_unit: `${body.property} - ${body.tenantUnit}`, // Include property in unit field
        tenant_code: body.tenantCode || null,
        effective_date: body.effectiveDate,
        primary_space: body.primarySpace,
        transfer_to_space: body.transferToSpace || null,
        submitter: body.submitter,
        other_notes: body.otherNotes ? `Property: ${body.property}. ${body.otherNotes}` : `Property: ${body.property}`,
        submission_date: new Date().toISOString(),
        synced_to_sheet: sheetWriteSuccess,
        sheet_row_number: sheetRowNumber,
        reverted: false,
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase error:', error);
      // If Google Sheets write succeeded, still return success
      if (sheetWriteSuccess) {
        return NextResponse.json({
          success: true,
          message: 'Parking change written to Google Sheet (Supabase backup failed)',
          sheetWriteSuccess: true,
        });
      }
      return NextResponse.json(
        { success: false, error: 'Failed to save parking change' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: sheetWriteSuccess 
        ? 'Parking change saved and written to OUTPUT tab' 
        : 'Parking change saved (Sheet write pending - configure GOOGLE_APPS_SCRIPT_URL)',
      id: data.id,
      sheetWriteSuccess,
      sheetError,
    });

  } catch (error) {
    console.error('Error processing parking change:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET endpoint to retrieve pending changes
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('parking_changes')
      .select('*')
      .order('submission_date', { ascending: false });

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch parking changes' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      changes: data || [],
    });

  } catch (error) {
    console.error('Error fetching parking changes:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
