import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface SnapshotData {
  property: string;
  totalSpots: number;
  occupiedSpots: number;
  vacantSpots: number;
  noticeSpots: number;
  occupancyRate: number;
  indoorTotal: number;
  indoorVacant: number;
  outdoorTotal: number;
  outdoorVacant: number;
  waitlistFirstSpot: number;
  waitlistIndoorUpgrade: number;
  waitlistSecondSpot: number;
  waitlistTotal: number;
}

// POST: Capture a snapshot for today
export async function POST(request: Request) {
  try {
    const { snapshots } = await request.json() as { snapshots: SnapshotData[] };
    
    if (!snapshots || snapshots.length === 0) {
      return NextResponse.json({ success: false, error: 'No snapshot data provided' }, { status: 400 });
    }

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // Check if we already have a snapshot for today
    const { data: existing } = await supabase
      .from('parking_snapshots')
      .select('id')
      .eq('snapshot_date', today)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'Snapshot already exists for today',
        alreadyExists: true 
      });
    }

    // Insert snapshots for each property
    const insertData = snapshots.map(s => ({
      snapshot_date: today,
      property: s.property,
      total_spots: s.totalSpots,
      occupied_spots: s.occupiedSpots,
      vacant_spots: s.vacantSpots,
      notice_spots: s.noticeSpots,
      occupancy_rate: s.occupancyRate,
      indoor_total: s.indoorTotal,
      indoor_vacant: s.indoorVacant,
      outdoor_total: s.outdoorTotal,
      outdoor_vacant: s.outdoorVacant,
      waitlist_first_spot: s.waitlistFirstSpot,
      waitlist_indoor_upgrade: s.waitlistIndoorUpgrade,
      waitlist_second_spot: s.waitlistSecondSpot,
      waitlist_total: s.waitlistTotal,
    }));

    const { error } = await supabase
      .from('parking_snapshots')
      .insert(insertData);

    if (error) {
      console.error('Error inserting snapshots:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      message: `Captured ${snapshots.length} property snapshots for ${today}`,
      snapshotCount: snapshots.length
    });

  } catch (error) {
    console.error('Error in snapshot API:', error);
    return NextResponse.json({ success: false, error: 'Failed to capture snapshot' }, { status: 500 });
  }
}

// GET: Retrieve historical snapshots
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const property = searchParams.get('property');
    const days = parseInt(searchParams.get('days') || '30');

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().split('T')[0];

    let query = supabase
      .from('parking_snapshots')
      .select('*')
      .gte('snapshot_date', startDateStr)
      .order('snapshot_date', { ascending: true });

    if (property && property !== 'all') {
      query = query.eq('property', property);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching snapshots:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // If fetching all properties, also calculate portfolio totals per day
    if (!property || property === 'all') {
      const portfolioByDate = new Map<string, {
        snapshot_date: string;
        total_spots: number;
        occupied_spots: number;
        vacant_spots: number;
        notice_spots: number;
        waitlist_total: number;
      }>();

      for (const row of data || []) {
        const existing = portfolioByDate.get(row.snapshot_date);
        if (existing) {
          existing.total_spots += row.total_spots;
          existing.occupied_spots += row.occupied_spots;
          existing.vacant_spots += row.vacant_spots;
          existing.notice_spots += row.notice_spots;
          existing.waitlist_total += row.waitlist_total;
        } else {
          portfolioByDate.set(row.snapshot_date, {
            snapshot_date: row.snapshot_date,
            total_spots: row.total_spots,
            occupied_spots: row.occupied_spots,
            vacant_spots: row.vacant_spots,
            notice_spots: row.notice_spots,
            waitlist_total: row.waitlist_total,
          });
        }
      }

      const portfolioTrend = Array.from(portfolioByDate.values()).map(d => ({
        ...d,
        occupancy_rate: d.total_spots > 0 ? Math.round((d.occupied_spots / d.total_spots) * 100) : 0,
        property: 'Portfolio',
      }));

      return NextResponse.json({
        success: true,
        snapshots: data,
        portfolioTrend,
      });
    }

    return NextResponse.json({
      success: true,
      snapshots: data,
    });

  } catch (error) {
    console.error('Error in snapshot API:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch snapshots' }, { status: 500 });
  }
}
