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
  tenant_code?: string | null;
  future_tenant_code?: string | null;
}

export const WAITLIST_TYPE_PRIORITY: Record<string, number> = {
  '1st Spot': 1,
  'Indoor Upgrade': 2,
  '2nd Spot': 3,
};

// Waitlist rows saved with older property names ("W. Montrose") use the inventory name
const PROPERTY_ALIASES: Record<string, string> = {
  'W. Montrose': 'West Montrose',
  'W Montrose': 'West Montrose',
};
export const normalizeParkingProperty = (property: string) => PROPERTY_ALIASES[property] || property;

// West Montrose residents park on their own side of the street:
// even buildings (3634, 3640, 3644, 3648) and odd buildings (3639, 3643, 3647)
const SAME_SIDE_PROPERTIES = ['West Montrose'];
export function isOnResidentSideOfStreet(spot: MatchableSpot, unit: string | null | undefined): boolean {
  if (!SAME_SIDE_PROPERTIES.includes(spot.property)) return true;
  const spotBuilding = spot.full_space_code.match(/(\d{4})\s*-/)?.[1];
  const unitBuilding = (unit || '').trim().match(/^(\d{4})-/)?.[1];
  if (!spotBuilding || !unitBuilding) return true;
  return Number(spotBuilding) % 2 === Number(unitBuilding) % 2;
}

const startsWithType = (spotType: string | null | undefined, type: string) =>
  (spotType || '').toLowerCase().startsWith(type.toLowerCase());

// Whether an active waitlist entry is eligible for a spot (property sharing, type, preferred spot type)
export function entryMatchesSpot(entry: ParkingWaitlist, spot: MatchableSpot): boolean {
  if (entry.status !== 'Active') return false;
  const residentProperties = [spot.property, ...getSharedResidentProperties(spot.property)];
  if (!residentProperties.includes(normalizeParkingProperty(entry.property))) return false;
  if (!isOnResidentSideOfStreet(spot, entry.unit_number)) return false;
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
      residentProperties.indexOf(normalizeParkingProperty(a.property)) - residentProperties.indexOf(normalizeParkingProperty(b.property)) ||
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
