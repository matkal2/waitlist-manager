export interface ReportSpot {
  property: string;
  spot_number: string;
  full_space_code: string;
  spot_type: string;
  status: string;
  tenant_code: string | null;
  tenant_name: string | null;
  unit_number: string | null;
  monthly_rent: number;
  available_date: string | null;
  termination_date: string | null;
  has_ev_charging: boolean;
  is_handicap: boolean;
}

export interface PropertySummary {
  property: string;
  total: number;
  indoor: number;
  outdoor: number;
  occupied: number;
  vacant: number;
  notice: number;
  reservedOrFuture: number;
  occupancyRate: number;
  waitlist: number;
}

// Same formula as the Tracking tab: (Occupied + Notice) / (Occupied + Vacant + Notice); Reserved/Future excluded
export function occupancyRate(occupied: number, vacant: number, notice: number): number {
  const active = occupied + vacant + notice;
  return active > 0 ? Math.round(((occupied + notice) / active) * 100) : 0;
}

export function summarize(property: string, spots: ReportSpot[], waitlist = 0): PropertySummary {
  const count = (status: string) => spots.filter(s => s.status === status).length;
  const occupied = count('Occupied');
  const vacant = count('Vacant');
  const notice = count('Notice');
  return {
    property,
    total: spots.length,
    indoor: spots.filter(s => s.spot_type === 'Indoor').length,
    outdoor: spots.filter(s => s.spot_type === 'Outdoor').length,
    occupied,
    vacant,
    notice,
    reservedOrFuture: count('Reserved') + count('Future'),
    occupancyRate: occupancyRate(occupied, vacant, notice),
    waitlist,
  };
}

export function groupByProperty(spots: ReportSpot[]): Record<string, ReportSpot[]> {
  const groups: Record<string, ReportSpot[]> = {};
  spots.forEach(spot => {
    (groups[spot.property] ||= []).push(spot);
  });
  return groups;
}

export function portfolioSummary(rows: PropertySummary[]): PropertySummary {
  const sum = (key: keyof PropertySummary) => rows.reduce((n, r) => n + (r[key] as number), 0);
  const occupied = sum('occupied');
  const vacant = sum('vacant');
  const notice = sum('notice');
  return {
    property: 'Portfolio total',
    total: sum('total'),
    indoor: sum('indoor'),
    outdoor: sum('outdoor'),
    occupied,
    vacant,
    notice,
    reservedOrFuture: sum('reservedOrFuture'),
    occupancyRate: occupancyRate(occupied, vacant, notice),
    waitlist: sum('waitlist'),
  };
}

export const sortBySpaceCode = (a: ReportSpot, b: ReportSpot) =>
  (a.full_space_code || '').localeCompare(b.full_space_code || '', undefined, { numeric: true });

export const spotLabel = (spot: ReportSpot) => spot.spot_number || spot.full_space_code?.split('-').pop() || '';

export const spotFeatures = (spot: ReportSpot) =>
  [spot.has_ev_charging ? 'EV' : '', spot.is_handicap ? 'HC' : ''].filter(Boolean).join(', ');

export const reportFileName = (propertyName: string | null, ext: 'pdf' | 'xlsx') => {
  const date = new Date().toISOString().split('T')[0];
  return propertyName
    ? `parking-inventory-${propertyName.replace(/\s+/g, '-')}-${date}.${ext}`
    : `parking-inventory-all-${date}.${ext}`;
};
