import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET() {
  try {
    // Calculate date 2 months ago
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
    const cutoffDate = twoMonthsAgo.toISOString().split('T')[0];

    // Find prospects (not transfers) with move-in date more than 2 months ago
    const { data: expiredEntries, error: fetchError } = await supabase
      .from('waitlist_entries')
      .select('id, full_name, move_in_date, entry_type')
      .eq('entry_type', 'Prospect')
      .lt('move_in_date', cutoffDate);

    if (fetchError) {
      throw fetchError;
    }

    if (!expiredEntries || expiredEntries.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No expired entries found',
        deleted: 0,
        cutoffDate,
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
      cutoffDate,
      deletedEntries: expiredEntries.map(e => ({
        name: e.full_name,
        move_in_date: e.move_in_date,
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
