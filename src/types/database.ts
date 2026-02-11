export type EntryType = 'Internal Transfer' | 'Prospect';
export type EntryStatus = 'Active' | 'Showing Scheduled' | 'Applied' | 'Signed Lease';
export type FloorPreference = 'Ground' | 'Middle' | 'Top' | 'No Preference';
export type NurtureStatus = 'scheduled' | 'applied' | 'lease_signed' | null;
export type EntrySource = 'self' | 'agent';
export type OutcomeStatus = 'active' | 'matched' | 'touring' | 'applied' | 'leased' | 'declined' | 'removed';

export interface WaitlistEntry {
  id: string;
  created_at: string;
  entry_type: EntryType;
  status: EntryStatus;
  full_name: string;
  email: string;
  phone: string;
  assigned_agent: string | null;
  property: string;
  unit_type_pref: string;
  preferred_units: string | null;
  floor_pref: FloorPreference;
  max_budget: number;
  move_in_date: string;
  move_in_date_end: string | null;
  current_unit_number: string | null;
  internal_notes: string | null;
  is_section_8: boolean;
  extended_retention: boolean;
  last_contacted: string | null;
  nurture_status: NurtureStatus;
  entry_source: EntrySource;
  matched_at: string | null;
  tour_scheduled_at: string | null;
  applied_at: string | null;
  lease_signed_at: string | null;
  outcome_status: OutcomeStatus;
  outcome_notes: string | null;
}

export type UnitStatus = 'Available' | 'Pending' | 'Leased';

export interface AvailableUnit {
  id: string;
  created_at: string;
  property: string;
  unit_number: string;
  unit_type: string;
  floor: string | null;
  rent_price: number;
  available_date: string;
  status: UnitStatus;
  notes: string | null;
  notified_emails: string[] | null;
}

export interface WaitlistMatch {
  unit: AvailableUnit;
  matches: WaitlistEntry[];
}

export interface ActivityLog {
  id: string;
  created_at: string;
  action_type: 'create' | 'edit' | 'delete';
  entry_id: string | null;
  entry_data: WaitlistEntry;
  changed_by: string | null;
  changes: Record<string, { old: unknown; new: unknown }> | null;
}

// =============================================================================
// PARKING TYPES
// =============================================================================

export type ParkingSpotType = 'Outdoor' | 'Indoor' | 'Covered' | 'Garage';
export type ParkingSpotStatus = 'Open' | 'Occupied' | 'Pending Termination';
export type ParkingWaitlistType = '1st Spot' | '2nd Spot' | 'Indoor Upgrade';
export type ParkingWaitlistStatus = 'Active' | 'Offered' | 'Assigned' | 'Cancelled';

export interface ParkingInventory {
  id: string;
  created_at: string;
  updated_at: string;
  property: string;
  spot_number: string;
  spot_type: ParkingSpotType;
  status: ParkingSpotStatus;
  tenant_name: string | null;
  unit_number: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_color: string | null;
  license_plate: string | null;
  assigned_date: string | null;
  termination_date: string | null;
  monthly_rate: number;
  linked_waitlist_entry_id: string | null;
  notes: string | null;
}

export interface ParkingWaitlist {
  id: string;
  created_at: string;
  updated_at: string;
  tenant_name: string;
  unit_number: string;
  email: string | null;
  phone: string | null;
  property: string;
  waitlist_type: ParkingWaitlistType;
  current_spot_number: string | null;
  preferred_spot_type: ParkingSpotType | 'Any' | null;
  status: ParkingWaitlistStatus;
  assigned_agent: string | null;
  offered_spot_id: string | null;
  offered_date: string | null;
  priority_order: number | null;
  notes: string | null;
}

export interface ParkingPermit {
  id: string;
  created_at: string;
  parking_spot_id: string;
  property: string;
  spot_number: string;
  tenant_name: string;
  unit_number: string;
  vehicle_make: string | null;
  vehicle_model: string | null;
  license_plate: string | null;
  issue_date: string;
  expiration_date: string | null;
  permit_number: string;
  generated_by: string | null;
}

export interface ParkingNotification {
  id: string;
  created_at: string;
  parking_spot_id: string;
  waitlist_entry_id: string;
  notification_type: 'spot_available' | 'offer_sent' | 'assignment_confirmed';
  sent_to_email: string | null;
  sent_to_agent: string | null;
}

// =============================================================================
// DATABASE SCHEMA
// =============================================================================

export interface Database {
  public: {
    Tables: {
      waitlist_entries: {
        Row: WaitlistEntry;
        Insert: Omit<WaitlistEntry, 'id' | 'created_at'>;
        Update: Partial<Omit<WaitlistEntry, 'id' | 'created_at'>>;
      };
      available_units: {
        Row: AvailableUnit;
        Insert: Omit<AvailableUnit, 'id' | 'created_at'>;
        Update: Partial<Omit<AvailableUnit, 'id' | 'created_at'>>;
      };
      activity_log: {
        Row: ActivityLog;
        Insert: Omit<ActivityLog, 'id' | 'created_at'>;
        Update: Partial<Omit<ActivityLog, 'id' | 'created_at'>>;
      };
      parking_inventory: {
        Row: ParkingInventory;
        Insert: Omit<ParkingInventory, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<ParkingInventory, 'id' | 'created_at' | 'updated_at'>>;
      };
      parking_waitlist: {
        Row: ParkingWaitlist;
        Insert: Omit<ParkingWaitlist, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<ParkingWaitlist, 'id' | 'created_at' | 'updated_at'>>;
      };
      parking_permits: {
        Row: ParkingPermit;
        Insert: Omit<ParkingPermit, 'id' | 'created_at'>;
        Update: Partial<Omit<ParkingPermit, 'id' | 'created_at'>>;
      };
      parking_notifications: {
        Row: ParkingNotification;
        Insert: Omit<ParkingNotification, 'id' | 'created_at'>;
        Update: Partial<Omit<ParkingNotification, 'id' | 'created_at'>>;
      };
    };
  };
}
