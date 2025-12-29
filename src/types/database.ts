export type EntryType = 'Internal Transfer' | 'Prospect';
export type EntryStatus = 'Active' | 'Contacted' | 'Leased' | 'Closed';
export type FloorPreference = 'Ground' | 'Middle' | 'Top' | 'No Preference';

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
  current_unit_number: string | null;
  internal_notes: string | null;
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
    };
  };
}
