import { NextResponse } from 'next/server';
import { runWaitlistCleanup } from '@/lib/waitlist-cleanup';
import { runParkingAutoMoveOuts } from '@/lib/parking-auto-moveout';

// Called daily by Vercel Cron (see vercel.json): sends match alerts, archives/purges expired entries,
// and terminates parking for residents the Directory lists as Past

export async function GET(request: Request) {
  // Verify the request is from Vercel Cron (in production)
  const authHeader = request.headers.get('authorization');
  if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Call the auto-notify endpoint
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://waitlist-hpvg.vercel.app';
    const response = await fetch(`${baseUrl}/api/auto-notify`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const result = await response.json();

    let cleanup: unknown;
    try {
      cleanup = await runWaitlistCleanup();
    } catch (cleanupError) {
      console.error('Cron cleanup error:', cleanupError);
      cleanup = { error: String(cleanupError) };
    }

    let parkingMoveOuts: unknown;
    try {
      parkingMoveOuts = await runParkingAutoMoveOuts(baseUrl);
    } catch (moveOutError) {
      console.error('Cron parking move-out error:', moveOutError);
      parkingMoveOuts = { error: String(moveOutError) };
    }

    return NextResponse.json({
      success: true,
      triggeredAt: new Date().toISOString(),
      source: 'cron',
      result,
      cleanup,
      parkingMoveOuts,
    });
  } catch (error) {
    console.error('Cron match-alerts error:', error);
    return NextResponse.json(
      { error: 'Failed to trigger match alerts', details: String(error) },
      { status: 500 }
    );
  }
}
