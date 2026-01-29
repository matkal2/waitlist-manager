import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET() {
  try {
    const today = new Date();
    
    // Calculate cutoff dates
    // Standard retention: 1 month after move-in date
    const oneMonthAgo = new Date(today);
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const standardCutoff = oneMonthAgo.toISOString().split('T')[0];
    
    // Extended retention: 1 year after move-in date
    const oneYearAgo = new Date(today);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const extendedCutoff = oneYearAgo.toISOString().split('T')[0];

    // Fetch all prospect entries to check for expiration
    const { data: allEntries, error: fetchError } = await supabase
      .from('waitlist_entries')
      .select('id, full_name, move_in_date, move_in_date_end, entry_type, extended_retention')
      .eq('entry_type', 'Prospect');

    if (fetchError) {
      throw fetchError;
    }

    if (!allEntries || allEntries.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No prospect entries found',
        deleted: 0,
      });
    }

    // Filter entries that should be deleted
    // Delete 1 month after move_in_date_end (or move_in_date if no end date)
    // If extended_retention is true, delete 1 year after instead
    const expiredEntries = allEntries.filter(entry => {
      const effectiveMoveInDate = entry.move_in_date_end || entry.move_in_date;
      const cutoff = entry.extended_retention ? extendedCutoff : standardCutoff;
      return effectiveMoveInDate < cutoff;
    });

    if (expiredEntries.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No expired entries found',
        deleted: 0,
        standardCutoff,
        extendedCutoff,
      });
    }

    // Delete the expired entries
    const idsToDelete = expiredEntries.map(e => e.id);
    const { error: deleteError } = await supabase
      .from('waitlist_entries')
      .delete()
      .in('id', idsToDelete);

    if (deleteError) {
      throw deleteError;
    }

    return NextResponse.json({
      success: true,
      message: `Deleted ${expiredEntries.length} expired prospect(s)`,
      deleted: expiredEntries.length,
      standardCutoff,
      extendedCutoff,
      deletedEntries: expiredEntries.map(e => ({
        name: e.full_name,
        move_in_date: e.move_in_date,
        move_in_date_end: e.move_in_date_end,
        extended_retention: e.extended_retention,
      })),
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    return NextResponse.json(
      { error: 'Failed to cleanup expired entries', details: String(error) },
      { status: 500 }
    );
  }
}
