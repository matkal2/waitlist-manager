import type { WaitlistEntry } from '@/types/database';

export interface MatchableUnit {
  property: string;
  unit_number: string;
  unit_type: string;
  available_date: string | null;
  rent_price: number;
  unique_id: string;
}

export type UnitMatchType = 'exact' | 'flexible';

// Days a unit may be available before/after the requested move-in range and still match
const FLEX_DAYS = 30;

// Outcomes that mean the person no longer needs a unit
export const CLOSED_OUTCOMES = ['leased', 'declined', 'removed'];

// Canonical property nickname (handles legacy naming like "N. Clark" or "440 Green Bay")
export function normalizePropertyName(name: string | null | undefined): string {
  if (!name) return '';
  const normalized = name.toLowerCase().trim();

  if (['n. clark', 'n clark', 'n_clark', 'north clark'].includes(normalized)) return 'North Clark';
  if (['w. montrose', 'w montrose', 'w_montrose', 'west montrose'].includes(normalized)) return 'W. Montrose';
  if (['w. chicago', 'w chicago', 'w_chicago', 'west chicago'].includes(normalized)) return 'W. Chicago';

  if (normalized.includes('countryside')) {
    if (normalized.endsWith(' t') || normalized.endsWith('_t') || normalized.includes('townho')) return 'Countryside T';
    if (normalized.endsWith(' c') || normalized.endsWith('_c') || normalized.includes('court') || normalized.includes('residences')) return 'Countryside C';
  }

  if (/green[\s_]*bay/.test(normalized)) {
    const number = normalized.match(/(246|440|546)/);
    if (number) return `Green Bay ${number[1]}`;
  }

  return name.trim();
}

const parseLocalDate = (value: string): Date => {
  const parts = value.split('-').map(Number);
  const date = parts.length === 3 && parts.every(n => !isNaN(n))
    ? new Date(parts[0], parts[1] - 1, parts[2])
    : new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

// Same rules as Match Alerts: property, unit type, move-in window (±30 days), preferred units, budget
export function getUnitMatchType(entry: WaitlistEntry, unit: MatchableUnit, today: Date): UnitMatchType | null {
  if (entry.status !== 'Active' || !entry.move_in_date || entry.archived_at) return null;
  if (CLOSED_OUTCOMES.includes(entry.outcome_status || '')) return null;
  if (normalizePropertyName(entry.property) !== normalizePropertyName(unit.property)) return null;

  const unitTypes = (entry.unit_type_pref || '').split(',').map(t => t.trim());
  if (!unitTypes.includes(unit.unit_type)) return null;

  if (entry.preferred_units?.trim()) {
    const preferred = entry.preferred_units.split(',').map(u => u.trim().toLowerCase());
    if (!preferred.includes(unit.unit_number.toLowerCase())) return null;
  }

  if (entry.max_budget > 0 && unit.rent_price > entry.max_budget) return null;

  const start = parseLocalDate(entry.move_in_date);
  const end = entry.move_in_date_end ? parseLocalDate(entry.move_in_date_end) : start;
  const availableNow = !unit.available_date || ['now', 'available', 'asap'].includes(unit.available_date.toLowerCase());
  const available = availableNow ? today : parseLocalDate(unit.available_date!);

  if (available >= start && available <= end) return 'exact';

  const flexStart = new Date(start);
  flexStart.setDate(flexStart.getDate() - FLEX_DAYS);
  const flexEnd = new Date(end);
  flexEnd.setDate(flexEnd.getDate() + FLEX_DAYS);
  return available >= flexStart && available <= flexEnd ? 'flexible' : null;
}
