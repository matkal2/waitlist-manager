import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import { getAgentEmail } from '@/lib/agents';
import { buildMatchAlertEmail, type UnitWithMatches } from '@/lib/match-alert-email';

const FROM = 'Waitlist Manager <noreply@hpvgproperties.com>';

export interface MatchAlertResult {
  agent: string;
  to: string;
  units: number;
  people: number;
  success: boolean;
  error?: string;
}

// Emails one agent about their matches, then records each unit/person pair and stamps entries as matched
export async function sendMatchAlert(
  agent: string,
  unitMatches: UnitWithMatches[],
  directory: Record<string, string>
): Promise<MatchAlertResult> {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const to = getAgentEmail(directory, agent);
  const entryIds = [...new Set(unitMatches.flatMap(um => um.entries.map(e => e.id)))];
  const summary = { agent, to, units: unitMatches.length, people: entryIds.length };

  const { subject, html } = buildMatchAlertEmail(agent, unitMatches);
  const { error } = await resend.emails.send({ from: FROM, to, subject, html });
  if (error) {
    console.error(`[Match alert] Failed to email ${agent}:`, error);
    return { ...summary, success: false, error: error.message };
  }

  const now = new Date().toISOString();
  const { error: logError } = await supabase.from('notified_matches').insert(
    unitMatches.map((um, i) => ({
      match_key: `${um.unit.unique_id}:${agent}:${Date.now()}:${i}`,
      agent,
      unit_id: um.unit.unique_id,
      entry_ids: um.entries.map(e => e.id),
      notified_at: now,
    }))
  );
  if (logError) console.error('[Match alert] Failed to record notified matches:', logError);

  const { error: matchedError } = await supabase
    .from('waitlist_entries')
    .update({ matched_at: now })
    .in('id', entryIds)
    .is('matched_at', null);
  if (matchedError) console.error('[Match alert] Failed to set matched_at:', matchedError);

  const { error: outcomeError } = await supabase
    .from('waitlist_entries')
    .update({ outcome_status: 'matched' })
    .in('id', entryIds)
    .or('outcome_status.is.null,outcome_status.eq.active');
  if (outcomeError) console.error('[Match alert] Failed to set outcome:', outcomeError);

  return { ...summary, success: true };
}
