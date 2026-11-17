import { authorize } from '@/lib/api-auth';
import { permissions } from '@/lib/permissions';
import { NextResponse } from 'next/server';
import { runWaitlistCleanup } from '@/lib/waitlist-cleanup';

// Archives expired prospects and permanently deletes entries archived for 6+ months
export async function GET(request: Request) {
  const caller = await authorize(request, permissions.canManageUsers);
  if (caller instanceof NextResponse) return caller;

  try {
    const { archived, purged } = await runWaitlistCleanup();
    return NextResponse.json({
      success: true,
      archived: archived.length,
      purged: purged.length,
      archivedEntries: archived,
      purgedEntries: purged,
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    return NextResponse.json(
      { error: 'Failed to clean up waitlist entries', details: String(error) },
      { status: 500 }
    );
  }
}
