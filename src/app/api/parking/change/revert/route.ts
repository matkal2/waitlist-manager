import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const GOOGLE_APPS_SCRIPT_URL = process.env.GOOGLE_APPS_SCRIPT_URL;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface RevertRequest {
  changeId: number;
  revertedBy: string;
}

interface UndoRevertRequest {
  changeId: number;
  undoneBy: string;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Check if this is an undo revert request
    if (body.action === 'undoRevert') {
      return handleUndoRevert(body as UndoRevertRequest);
    }

    // Otherwise, handle normal revert
    return handleRevert(body as RevertRequest);

  } catch (error) {
    console.error('Error in revert endpoint:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function handleRevert(body: RevertRequest) {
  if (!body.changeId) {
    return NextResponse.json(
      { success: false, error: 'Missing change ID' },
      { status: 400 }
    );
  }

  // Get the change record from Supabase
  const { data: change, error: fetchError } = await supabase
    .from('parking_changes')
    .select('*')
    .eq('id', body.changeId)
    .single();

  if (fetchError || !change) {
    console.error('Error fetching change:', fetchError);
    return NextResponse.json(
      { success: false, error: 'Change not found' },
      { status: 404 }
    );
  }

  // Check if already reverted
  if (change.reverted) {
    return NextResponse.json(
      { success: false, error: 'This change has already been reverted' },
      { status: 400 }
    );
  }

  // Delete the row from Google Sheets OUTPUT tab
  let sheetDeleteSuccess = false;
  let sheetError = null;

  if (GOOGLE_APPS_SCRIPT_URL) {
    try {
      // If we have a row number, delete by row number
      // Otherwise, try to find and delete by matching data
      const params = new URLSearchParams({
        action: change.sheet_row_number ? 'deleteRow' : 'findAndDeleteRow',
        ...(change.sheet_row_number 
          ? { rowNumber: change.sheet_row_number.toString() }
          : {
              type: change.type,
              tenantName: change.tenant_name,
              primarySpace: change.primary_space,
            }
        ),
      });

      const url = `${GOOGLE_APPS_SCRIPT_URL}?${params.toString()}`;
      console.log('Calling Google Apps Script:', params.get('action'), change.sheet_row_number || 'by data match');
      
      const sheetResponse = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
      });

      const responseText = await sheetResponse.text();
      console.log('Google Sheets response:', responseText);
      
      try {
        const sheetResult = JSON.parse(responseText);
        sheetDeleteSuccess = sheetResult.success;
        if (!sheetDeleteSuccess) {
          sheetError = sheetResult.error;
        }
      } catch {
        sheetDeleteSuccess = responseText.includes('success') || sheetResponse.ok;
        if (!sheetDeleteSuccess) {
          sheetError = responseText;
        }
      }
    } catch (err) {
      console.error('Google Sheets delete error:', err);
      sheetError = String(err);
    }
  }

  // Mark the change as reverted in Supabase
  const { error: updateError } = await supabase
    .from('parking_changes')
    .update({
      reverted: true,
      reverted_at: new Date().toISOString(),
      reverted_by: body.revertedBy || 'Unknown',
    })
    .eq('id', body.changeId);

  if (updateError) {
    console.error('Error updating change status:', updateError);
    return NextResponse.json(
      { success: false, error: 'Failed to mark change as reverted' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    message: sheetDeleteSuccess 
      ? 'Change reverted successfully' 
      : 'Change marked as reverted (sheet deletion may require manual action)',
    sheetDeleteSuccess,
    sheetError,
  });
}

async function handleUndoRevert(body: UndoRevertRequest) {
  if (!body.changeId) {
    return NextResponse.json(
      { success: false, error: 'Missing change ID' },
      { status: 400 }
    );
  }

  // Get the change record from Supabase
  const { data: change, error: fetchError } = await supabase
    .from('parking_changes')
    .select('*')
    .eq('id', body.changeId)
    .single();

  if (fetchError || !change) {
    console.error('Error fetching change:', fetchError);
    return NextResponse.json(
      { success: false, error: 'Change not found' },
      { status: 404 }
    );
  }

  // Check if it's actually reverted
  if (!change.reverted) {
    return NextResponse.json(
      { success: false, error: 'This change has not been reverted' },
      { status: 400 }
    );
  }

  // Check if within 24 hours of revert
  if (change.reverted_at) {
    const revertedAt = new Date(change.reverted_at);
    const now = new Date();
    const hoursSinceRevert = (now.getTime() - revertedAt.getTime()) / (1000 * 60 * 60);
    
    if (hoursSinceRevert > 24) {
      return NextResponse.json(
        { success: false, error: 'Cannot undo revert - more than 24 hours have passed' },
        { status: 400 }
      );
    }
  }

  // Re-add the row to Google Sheets OUTPUT tab
  let sheetAddSuccess = false;
  let sheetError = null;
  let newRowNumber = null;

  if (GOOGLE_APPS_SCRIPT_URL) {
    try {
      // Extract property from tenant_unit or other_notes
      let property = '';
      if (change.other_notes && change.other_notes.includes('Property:')) {
        const match = change.other_notes.match(/Property:\s*([^.]+)/);
        if (match) property = match[1].trim();
      }
      
      const params = new URLSearchParams({
        type: change.type,
        tenantName: change.tenant_name,
        tenantUnit: change.tenant_unit?.split(' - ').pop() || change.tenant_unit || '',
        tenantCode: change.tenant_code || '',
        property: property,
        effectiveDate: new Date(change.effective_date).toLocaleDateString('en-US'),
        primarySpace: change.primary_space,
        transferToSpace: change.transfer_to_space || '',
        submitter: change.submitter,
        otherNotes: `[RESTORED] ${change.other_notes || ''}`,
        submissionDate: new Date().toLocaleString('en-US'),
      });

      const url = `${GOOGLE_APPS_SCRIPT_URL}?${params.toString()}`;
      console.log('Re-adding row to Google Sheets');
      
      const sheetResponse = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
      });

      const responseText = await sheetResponse.text();
      console.log('Google Sheets response:', responseText);
      
      try {
        const sheetResult = JSON.parse(responseText);
        sheetAddSuccess = sheetResult.success;
        newRowNumber = sheetResult.rowNumber || null;
        if (!sheetAddSuccess) {
          sheetError = sheetResult.error;
        }
      } catch {
        sheetAddSuccess = responseText.includes('success') || sheetResponse.ok;
        if (!sheetAddSuccess) {
          sheetError = responseText;
        }
      }
    } catch (err) {
      console.error('Google Sheets add error:', err);
      sheetError = String(err);
    }
  }

  // Mark the change as not reverted in Supabase
  const { error: updateError } = await supabase
    .from('parking_changes')
    .update({
      reverted: false,
      reverted_at: null,
      reverted_by: null,
      sheet_row_number: newRowNumber,
    })
    .eq('id', body.changeId);

  if (updateError) {
    console.error('Error updating change status:', updateError);
    return NextResponse.json(
      { success: false, error: 'Failed to undo revert' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    message: sheetAddSuccess 
      ? 'Revert undone - change restored to OUTPUT tab' 
      : 'Revert undone in system (sheet may require manual update)',
    sheetAddSuccess,
    sheetError,
  });
}
