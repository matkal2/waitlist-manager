import type { ParkingWaitlist } from '@/types/database';
import { getSharedResidentProperties } from '@/lib/properties';

export interface MatchableSpot {
  id?: string;
  property: string;
  spot_number?: string;
  full_space_code: string;
  spot_type?: string | null;
  status?: string;
  available_date?: string | null;
  termination_date?: string | null;
  reserved_for_applicant?: string | null;
  has_future_tenant?: boolean;
}

export const WAITLIST_TYPE_PRIORITY: Record<string, number> = {
  '1st Spot': 1,
  'Indoor Upgrade': 2,
  '2nd Spot': 3,
};

const startsWithType = (spotType: string | null | undefined, type: string) =>
  (spotType || '').toLowerCase().startsWith(type.toLowerCase());

// Whether an active waitlist entry is eligible for a spot (property sharing, type, preferred spot type)
export function entryMatchesSpot(entry: ParkingWaitlist, spot: MatchableSpot): boolean {
  if (entry.status !== 'Active') return false;
  const residentProperties = [spot.property, ...getSharedResidentProperties(spot.property)];
  if (!residentProperties.includes(entry.property)) return false;
  if (entry.waitlist_type === 'Indoor Upgrade') {
    if (!startsWithType(spot.spot_type, 'Indoor')) return false;
  } else if (entry.waitlist_type !== '1st Spot') {
    return false;
  }
  const preferred = entry.preferred_spot_type;
  if (preferred && preferred !== 'Any' && !startsWithType(spot.spot_type, preferred)) return false;
  return true;
}

// Matching entries for a spot in line order: own-property residents first, then shared-lot residents;
// within each, 1st Spot -> Indoor Upgrade -> 2nd Spot, oldest first
export function getSpotMatches(spot: MatchableSpot, waitlist: ParkingWaitlist[]): ParkingWaitlist[] {
  const residentProperties = [spot.property, ...getSharedResidentProperties(spot.property)];
  return waitlist
    .filter(entry => entryMatchesSpot(entry, spot))
    .sort((a, b) =>
      residentProperties.indexOf(a.property) - residentProperties.indexOf(b.property) ||
      (WAITLIST_TYPE_PRIORITY[a.waitlist_type] || 3) - (WAITLIST_TYPE_PRIORITY[b.waitlist_type] || 3) ||
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
}

// Vacant now or on notice, and not already reserved or assigned to an incoming tenant
export const isSpotOpenForWaitlist = (spot: MatchableSpot) =>
  (spot.status === 'Vacant' || spot.status === 'Notice') &&
  !spot.reserved_for_applicant &&
  !spot.has_future_tenant;

// "Allen, Katrina" and "Katrina Allen" compare equal
export const normalizePersonName = (name: string) =>
  (name || '').toLowerCase().split(/[^a-z]+/).filter(Boolean).sort().join(' ');
