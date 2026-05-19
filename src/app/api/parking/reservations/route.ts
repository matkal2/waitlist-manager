import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ParkingReservation } from '@/types/database';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET - Fetch all reservations (optionally filtered by status or property)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const property = searchParams.get('property');
    
    let query = supabase
      .from('parking_reservations')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (status) {
      query = query.eq('status', status);
    }
    
    if (property) {
      query = query.eq('property', property);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('Error fetching reservations:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({ reservations: data });
  } catch (error) {
    console.error('Error in GET /api/parking/reservations:', error);
    return NextResponse.json({ error: 'Failed to fetch reservations' }, { status: 500 });
  }
}

// POST - Create a new reservation
export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    const {
      property,
      spot_number,
      full_space_code,
      spot_type,
      monthly_rent,
      applicant_name,
      unit_number,
      email,
      phone,
      expected_move_in,
      expiration_date,
      reserved_by,
      notes
    } = body;
    
    // Validate required fields
    if (!property || !spot_number || !full_space_code || !applicant_name || !unit_number) {
      return NextResponse.json(
        { error: 'Missing required fields: property, spot_number, full_space_code, applicant_name, unit_number' },
        { status: 400 }
      );
    }
    
    // Check if spot already has an active reservation
    const { data: existingReservation } = await supabase
      .from('parking_reservations')
      .select('id')
      .eq('full_space_code', full_space_code)
      .eq('status', 'active')
      .single();
    
    if (existingReservation) {
      return NextResponse.json(
        { error: 'This spot already has an active reservation' },
        { status: 409 }
      );
    }
    
    // Create the reservation
    const { data, error } = await supabase
      .from('parking_reservations')
      .insert({
        property,
        spot_number,
        full_space_code,
        spot_type: spot_type || 'Indoor',
        monthly_rent: monthly_rent || 0,
        applicant_name,
        unit_number,
        email: email || null,
        phone: phone || null,
        expected_move_in: expected_move_in || null,
        reservation_date: new Date().toISOString().split('T')[0],
        expiration_date: expiration_date || null,
        status: 'active',
        reserved_by: reserved_by || null,
        notes: notes || null
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error creating reservation:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({ reservation: data }, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/parking/reservations:', error);
    return NextResponse.json({ error: 'Failed to create reservation' }, { status: 500 });
  }
}

// PATCH - Update a reservation (cancel, convert, etc.)
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;
    
    if (!id) {
      return NextResponse.json({ error: 'Reservation ID is required' }, { status: 400 });
    }
    
    // If converting, add conversion timestamp
    if (updates.status === 'converted' && !updates.converted_at) {
      updates.converted_at = new Date().toISOString();
    }
    
    const { data, error } = await supabase
      .from('parking_reservations')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.error('Error updating reservation:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({ reservation: data });
  } catch (error) {
    console.error('Error in PATCH /api/parking/reservations:', error);
    return NextResponse.json({ error: 'Failed to update reservation' }, { status: 500 });
  }
}

// DELETE - Delete a reservation (soft delete by setting status to cancelled)
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json({ error: 'Reservation ID is required' }, { status: 400 });
    }
    
    const { data, error } = await supabase
      .from('parking_reservations')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.error('Error cancelling reservation:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({ reservation: data });
  } catch (error) {
    console.error('Error in DELETE /api/parking/reservations:', error);
    return NextResponse.json({ error: 'Failed to cancel reservation' }, { status: 500 });
  }
}
