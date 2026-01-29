import { NextResponse } from 'next/server';

// This endpoint is called by Vercel Cron every 3 hours
// It triggers the auto-notify endpoint to check for new matches

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

    return NextResponse.json({
      success: true,
      triggeredAt: new Date().toISOString(),
      source: 'cron',
      result,
    });
  } catch (error) {
    console.error('Cron match-alerts error:', error);
    return NextResponse.json(
      { error: 'Failed to trigger match alerts', details: String(error) },
      { status: 500 }
    );
  }
}
