import { createClient } from '@supabase/supabase-js';

interface MovedOutSpot {
  property: string;
  full_space_code: string;
  moved_out_tenant_code: string | null;
  moved_out_tenant_name: string | null;
  moved_out_unit: string | null;
  move_out_date: string | null;
}

export const AUTO_MOVEOUT_SUBMITTER = 'Auto move-out';

const normalizeName = (name: string | null | undefined) =>
  (name || '').toLowerCase().split(/[^a-z]+/).filter(Boolean).sort().join(' ');

// Sends one Termination to OUTPUT per spot still held by a resident the Directory lists as Past.
// Skips any spot that already has a Termination for that resident (including undone ones).
export async function runParkingAutoMoveOuts(baseUrl: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const res = await fetch(`${baseUrl}/api/parking`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Parking inventory request failed (${res.status})`);
  const data = await res.json();
  const candidates: MovedOutSpot[] = (data.spots || []).filter(
    (s: MovedOutSpot) => s.moved_out_tenant_code && s.move_out_date
  );

  const submitted: string[] = [];
  const skipped: string[] = [];
  const failed: { spot: string; error: string }[] = [];

  for (const spot of candidates) {
    const { data: existing, error } = await supabase
      .from('parking_changes')
      .select('tenant_code, tenant_name')
      .eq('type', 'Termination')
      .eq('primary_space', spot.full_space_code);
    if (error) {
      failed.push({ spot: spot.full_space_code, error: error.message });
      continue;
    }
    const alreadyTerminated = (existing || []).some(row =>
      row.tenant_code === spot.moved_out_tenant_code ||
      normalizeName(row.tenant_name) === normalizeName(spot.moved_out_tenant_name)
    );
    if (alreadyTerminated) {
      skipped.push(spot.full_space_code);
      continue;
    }

    const moveOut = new Date(`${spot.move_out_date}T00:00:00`).toLocaleDateString('en-US');
    const response = await fetch(`${baseUrl}/api/parking/change`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'Termination',
        tenantName: spot.moved_out_tenant_name,
        tenantCode: spot.moved_out_tenant_code,
        tenantUnit: spot.moved_out_unit || 'N/A',
        property: spot.property,
        effectiveDate: spot.move_out_date,
        primarySpace: spot.full_space_code,
        transferToSpace: '',
        submitter: AUTO_MOVEOUT_SUBMITTER,
        otherNotes: `Resident is Past in the Directory (moved out ${moveOut})`,
        date: new Date().toLocaleDateString('en-US'),
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (response.ok && result.success) {
      submitted.push(spot.full_space_code);
    } else {
      failed.push({ spot: spot.full_space_code, error: result.error || `HTTP ${response.status}` });
    }
  }

  return { candidates: candidates.length, submitted, skipped, failed };
}
