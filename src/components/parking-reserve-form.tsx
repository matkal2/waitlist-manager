'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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

interface ParkingSpot {
  id: string;
  property: string;
  spot_type: string;
  spot_number: string;
  full_space_code: string;
  monthly_rent: number;
  status: string;
}

interface ParkingReserveFormProps {
  spot: ParkingSpot | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function ParkingReserveForm({ spot, open, onOpenChange, onSuccess }: ParkingReserveFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [units, setUnits] = useState<string[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(false);
  
  const [formData, setFormData] = useState({
    applicant_name: '',
    unit_number: '',
    expected_move_in: '',
    notes: '',
  });

  // Fetch units for the property when dialog opens
  useEffect(() => {
    if (open && spot?.property) {
      setLoadingUnits(true);
      fetch('/api/directory')
        .then(res => res.json())
        .then(data => {
          // Extract unique unit numbers from directory for this property
          const unitSet = new Set<string>();
          if (data.directory) {
            data.directory.forEach((entry: { unitNumber?: string; property?: string }) => {
              // Filter by property and extract unit numbers
              if (entry.unitNumber && entry.property === spot.property) {
                unitSet.add(entry.unitNumber);
              }
            });
          }
          // Sort units naturally (1, 2, 10 instead of 1, 10, 2)
          const sortedUnits = Array.from(unitSet).sort((a, b) => {
            const numA = parseInt(a.replace(/\D/g, '')) || 0;
            const numB = parseInt(b.replace(/\D/g, '')) || 0;
            return numA - numB;
          });
          setUnits(sortedUnits);
        })
        .catch(() => setUnits([]))
        .finally(() => setLoadingUnits(false));
    }
  }, [open, spot?.property]);

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
          notes: formData.notes || null,
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
        notes: '',
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
      notes: '',
    });
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
              <Select
                value={formData.unit_number}
                onValueChange={(value) => setFormData({ ...formData, unit_number: value })}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder={loadingUnits ? "Loading units..." : "Select unit"} />
                </SelectTrigger>
                <SelectContent>
                  {units.map((unit) => (
                    <SelectItem key={unit} value={unit}>
                      {unit}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
          
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Any additional notes about this reservation..."
              rows={2}
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
