import type { WaitlistEntry } from '@/types/database';
import type { MatchableUnit, UnitMatchType } from '@/lib/waitlist-matching';
import { UNASSIGNED_AGENT } from '@/lib/agents';

export type MatchedEntry = WaitlistEntry & { matchType: UnitMatchType };

export interface UnitWithMatches {
  unit: MatchableUnit;
  entries: MatchedEntry[];
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://waitlist-hpvg.vercel.app';
const LOGO_URL = 'https://waitlist-hpvg.vercel.app/highpoint-logo.png';

const escapeHtml = (value: string | null | undefined) =>
  (value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// Date-only values (YYYY-MM-DD) are formatted as-is so they never shift a day across time zones
const formatDay = (value: string | null | undefined) => {
  if (!value) return '';
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return value;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
};

const formatTimestamp = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' }) : '';

const isAvailableNow = (date: string | null) => !date || ['now', 'available', 'asap'].includes(date.toLowerCase());

// Internal Transfers first, then longest on the waitlist
export function sortByPriority(entries: MatchedEntry[]): MatchedEntry[] {
  return [...entries].sort((a, b) => {
    if (a.entry_type !== b.entry_type) return a.entry_type === 'Internal Transfer' ? -1 : 1;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
}

const pill = (text: string, background: string, color: string) =>
  `<span style="display: inline-block; background: ${background}; color: ${color}; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; margin-left: 6px; vertical-align: middle;">${text}</span>`;

const button = (href: string, label: string, primary = false) =>
  `<a href="${href}" style="display: inline-block; margin: 8px 8px 0 0; padding: 8px 14px; border-radius: 6px; font-size: 13px; font-weight: 600; text-decoration: none; ${
    primary ? 'background: #2563eb; color: #ffffff; border: 1px solid #2563eb;' : 'background: #ffffff; color: #1a1a1a; border: 1px solid #d1d5db;'
  }">${label}</a>`;

function renderPerson(entry: MatchedEntry, unit: MatchableUnit): string {
  const tags = [
    entry.entry_type === 'Internal Transfer' ? pill('Transfer', '#dbeafe', '#1d4ed8') : pill('Prospect', '#f3f4f6', '#374151'),
    entry.is_section_8 ? pill('Section 8', '#ede9fe', '#6d28d9') : '',
    entry.matchType === 'flexible' ? pill('Flexible date', '#fef3c7', '#92400e') : '',
  ].join('');

  const moveIn = entry.move_in_date_end
    ? `${formatDay(entry.move_in_date)} – ${formatDay(entry.move_in_date_end)}`
    : formatDay(entry.move_in_date);
  const details = [
    `Budget ${entry.max_budget > 0 ? `$${entry.max_budget.toLocaleString()}` : 'not set'}`,
    `Move-in ${moveIn}`,
    `Waiting since ${formatTimestamp(entry.created_at)}`,
  ].join(' &nbsp;·&nbsp; ');
  const flexNote = entry.matchType === 'flexible'
    ? `<div style="color: #92400e; font-size: 12px; margin-top: 4px;">Unit is available ${isAvailableNow(unit.available_date) ? 'now' : formatDay(unit.available_date)}, outside their requested move-in dates.</div>`
    : '';
  const contact = [entry.phone, entry.email].filter(Boolean).map(v => escapeHtml(v)).join(' &nbsp;·&nbsp; ') || 'No contact info on file';

  const buttons = button(`${APP_URL}/waitlist?entry=${entry.id}`, 'Open in Waitlist Manager', true);

  return `
    <div style="padding: 16px 20px; border-top: 1px solid #eee;">
      <div style="font-size: 15px; font-weight: 600; color: #1a1a1a;">${escapeHtml(entry.full_name)}${tags}</div>
      <div style="color: #666; font-size: 13px; margin-top: 4px;">${details}</div>
      ${flexNote}
      <div style="color: #1a1a1a; font-size: 13px; margin-top: 6px;">${contact}</div>
      <div>${buttons}</div>
    </div>`;
}

function renderUnit({ unit, entries }: UnitWithMatches): string {
  const available = isAvailableNow(unit.available_date) ? 'Available now' : `Available ${formatDay(unit.available_date)}`;
  return `
    <div style="border: 1px solid #e5e7eb; border-radius: 10px; margin: 24px 0; overflow: hidden;">
      <div style="background: #f8f9fa; padding: 16px 20px;">
        <div style="font-size: 16px; font-weight: 700; color: #1a1a1a;">${escapeHtml(unit.property)} &middot; Unit ${escapeHtml(unit.unit_number)}</div>
        <div style="color: #666; font-size: 13px; margin-top: 4px;">${escapeHtml(unit.unit_type)} &nbsp;·&nbsp; $${unit.rent_price.toLocaleString()}/mo &nbsp;·&nbsp; ${available}</div>
      </div>
      ${sortByPriority(entries).map(entry => renderPerson(entry, unit)).join('')}
    </div>`;
}

export function buildMatchAlertEmail(agent: string, unitMatches: UnitWithMatches[]): { subject: string; html: string } {
  const people = new Set(unitMatches.flatMap(um => um.entries.map(e => e.id))).size;
  const units = unitMatches.length;
  const isUnassigned = !agent || agent === UNASSIGNED_AGENT;
  const first = unitMatches[0].unit;

  const subject = units === 1
    ? `Waitlist match: ${first.property} Unit ${first.unit_number} (${people} ${people === 1 ? 'person' : 'people'})`
    : `Waitlist matches: ${units} units, ${people} ${people === 1 ? 'person' : 'people'}`;

  const intro = isUnassigned
    ? `${people} unassigned waitlist ${people === 1 ? 'entry matches' : 'entries match'} ${units === 1 ? 'an available unit' : `${units} available units`}. Claim them in Waitlist Manager and reach out.`
    : `${people} ${people === 1 ? 'person' : 'people'} on your waitlist ${people === 1 ? 'matches' : 'match'} ${units === 1 ? 'an available unit' : `${units} available units`}.`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5;">
  <div style="max-width: 640px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: white; border-radius: 12px; padding: 40px 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
      <div style="text-align: center; margin-bottom: 24px;">
        <img src="${LOGO_URL}" alt="Highpoint Living" style="max-width: 200px; height: auto;">
      </div>
      <h1 style="color: #1a1a1a; margin: 0 0 20px; text-align: center; font-size: 24px;">New Waitlist ${people === 1 ? 'Match' : 'Matches'}</h1>
      <p style="color: #666; font-size: 16px; line-height: 1.6; margin: 0 0 8px;">Hi ${isUnassigned ? 'Leasing Team' : escapeHtml(agent.split(' ')[0])},</p>
      <p style="color: #666; font-size: 16px; line-height: 1.6; margin: 0;">${intro} Reach out in the order listed: internal transfers first, then whoever has waited longest.</p>
      ${unitMatches.map(renderUnit).join('')}
      <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 24px 0 0;">
        <h3 style="margin: 0 0 8px; color: #1a1a1a; font-size: 14px;">What to do next</h3>
        <ol style="margin: 0; padding-left: 20px; color: #666; font-size: 14px; line-height: 1.7;">
          <li>Reach out to each person about the unit.</li>
          <li>Open them in Waitlist Manager and click <strong>Contacted</strong>.</li>
          <li>Update their outcome when they tour, apply, or sign.</li>
        </ol>
      </div>
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
      <p style="color: #999; font-size: 12px; margin: 0; text-align: center;">
        You're receiving this because ${isUnassigned ? 'these waitlist entries have no assigned agent' : "you're the assigned agent for these waitlist entries"}.
      </p>
      <p style="color: #999; font-size: 12px; margin: 8px 0 0; text-align: center;">
        Highpoint Living &bull; <a href="${APP_URL}/waitlist" style="color: #2563eb;">Waitlist Manager</a>
      </p>
    </div>
  </div>
</body>
</html>`;

  return { subject, html };
}
