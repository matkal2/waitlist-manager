'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar, User, Home } from 'lucide-react';
import { PROPERTY_UNITS } from '@/lib/property-units';
import { getSharedResidentProperties } from '@/lib/properties';

interface ParkingSpot {
  id: string;
  property: string;
  spot_type: string;
  spot_number: string;
  full_space_code: string;
  monthly_rent: number;
  status: string;
}

interface InventoryUnitSource {
  property: string;
  unit_number?: string | null;
  future_unit_number?: string | null;
}

interface DirectoryEntry {
  unitNumber?: string;
  property?: string;
}

// Static unit lists use a few legacy property names
const UNIT_LIST_ALIASES: Record<string, string> = {
  'North Clark': 'N. Clark',
  'West Chicago': 'W. Chicago',
  'West Montrose': 'W. Montrose',
};

// "8465-204" -> "8465"; plain unit numbers have no building prefix
const buildingPrefix = (unit: string) => (unit.includes('-') ? unit.split('-')[0] : null);

interface ParkingReserveFormProps {
  spot: ParkingSpot | null;
  spots?: InventoryUnitSource[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  reservedBy: string;
}

export function ParkingReserveForm({ spot, spots = [], open, onOpenChange, onSuccess, reservedBy }: ParkingReserveFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    applicant_name: '',
    unit_number: '',
    expected_move_in: '',
  });

  // Applicant may live at the spot's property or at a property that shares this lot
  const [applicantProperty, setApplicantProperty] = useState(spot?.property || '');
  const applicantPropertyOptions = spot?.property
    ? [spot.property, ...getSharedResidentProperties(spot.property)]
    : [];

  useEffect(() => {
    setApplicantProperty(spot?.property || '');
    setFormData(prev => ({ ...prev, unit_number: '' }));
  }, [spot?.property, spot?.full_space_code]);

  const [directory, setDirectory] = useState<DirectoryEntry[]>([]);
  useEffect(() => {
    if (open && directory.length === 0) {
      fetch('/api/directory')
        .then(res => res.json())
        .then(data => setDirectory(data.directory || []))
        .catch(err => console.error('Failed to load directory:', err));
    }
  }, [open, directory.length]);

  // Unit suggestions: static list + units already parking in this lot + Directory units in the same
  // buildings (e.g. the Grand lot serves the 8465-8471 buildings, which the Directory files under Green Bay 546)
  const units = (() => {
    if (!applicantProperty || !spot) return [];
    const result = new Set<string>(PROPERTY_UNITS[UNIT_LIST_ALIASES[applicantProperty] || applicantProperty] || []);
    const isOwnLot = applicantProperty === spot.property;
    const prefixes = new Set<string>();
    if (isOwnLot) {
      spots
        .filter(s => s.property === spot.property)
        .flatMap(s => [s.unit_number, s.future_unit_number])
        .forEach(unit => {
          if (!unit) return;
          result.add(unit);
          const prefix = buildingPrefix(unit);
          if (prefix) prefixes.add(prefix);
        });
    }
    directory.forEach(entry => {
      if (!entry.unitNumber) return;
      const prefix = buildingPrefix(entry.unitNumber);
      const sameBuilding = prefix !== null && prefixes.has(prefix);
      const sameProperty = entry.property === applicantProperty && (prefixes.size === 0 || !prefix || sameBuilding);
      if (sameBuilding || sameProperty) result.add(entry.unitNumber);
    });
    return [...result].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!spot) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/parking/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property: spot.property,
          spot_number: spot.spot_number,
          full_space_code: spot.full_space_code,
          spot_type: spot.spot_type,
          monthly_rent: spot.monthly_rent,
          applicant_name: formData.applicant_name,
          unit_number: formData.unit_number,
          expected_move_in: formData.expected_move_in || null,
          reserved_by: reservedBy,
          notes: applicantProperty && applicantProperty !== spot.property
            ? `Applicant building: ${applicantProperty}`
            : null,
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create reservation');
      }
      
      // Reset form and close
      setFormData({
        applicant_name: '',
        unit_number: '',
        expected_move_in: '',
      });
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setError(null);
    setFormData({
      applicant_name: '',
      unit_number: '',
      expected_move_in: '',
    });
    setApplicantProperty(spot?.property || '');
    onOpenChange(false);
  };

  if (!spot) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-amber-600" />
            Reserve Parking Spot
          </DialogTitle>
          <DialogDescription>
            Reserve <strong>{spot.full_space_code}</strong> ({spot.spot_type}) for an applicant in screening.
            This spot will be held until the applicant signs their lease.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
              {error}
            </div>
          )}
          
          {applicantPropertyOptions.length > 1 && (
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <Home className="h-3 w-3" />
                Applicant&apos;s Building *
              </Label>
              <Select
                value={applicantProperty}
                onValueChange={(value) => {
                  setApplicantProperty(value);
                  setFormData({ ...formData, unit_number: '' });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select building" />
                </SelectTrigger>
                <SelectContent>
                  {applicantPropertyOptions.map((property) => (
                    <SelectItem key={property} value={property}>
                      {property}{property !== spot.property ? ' (shared lot)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="applicant_name" className="flex items-center gap-1">
                <User className="h-3 w-3" />
                Applicant Name *
              </Label>
              <Input
                id="applicant_name"
                value={formData.applicant_name}
                onChange={(e) => setFormData({ ...formData, applicant_name: e.target.value })}
                placeholder="John Doe"
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="unit_number" className="flex items-center gap-1">
                <Home className="h-3 w-3" />
                Unit Number *
              </Label>
<Input
                id="unit_number"
                list="reserve-unit-options"
                value={formData.unit_number}
                onChange={(e) => setFormData({ ...formData, unit_number: e.target.value })}
                placeholder={units.length > 0 ? 'Select or type unit' : 'Type unit number'}
                autoComplete="off"
                required
              />
              <datalist id="reserve-unit-options">
                {units.map((unit) => (
                  <option key={unit} value={unit} />
                ))}
              </datalist>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="expected_move_in" className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Expected Move-In Date *
            </Label>
            <Input
              id="expected_move_in"
              type="date"
              value={formData.expected_move_in}
              onChange={(e) => setFormData({ ...formData, expected_move_in: e.target.value })}
              required
            />
          </div>
          
          <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-800">
            <strong>Note:</strong> This reservation will hold the spot until the applicant&apos;s lease is signed.
            Once they appear in the Directory, you&apos;ll be prompted to convert this to an official assignment.
          </div>
          
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="bg-amber-600 hover:bg-amber-700">
              {loading ? 'Reserving...' : 'Reserve Spot'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
