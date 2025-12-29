'use client';

import { useState } from 'react';
import { AvailableUnit } from '@/types/database';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus, Trash2, Home } from 'lucide-react';

const PROPERTIES = [
  '246 Green Bay', '440 Green Bay', '546 Green Bay', 'Broadway', 'Countryside C',
  'Countryside T', 'Elston', 'Fullerton', 'Greenleaf', 'Kedzie', 'Kennedy',
  'Liberty', 'N. Clark', 'Park', 'Rogers', 'Sheffield', 'Talman', 'W. Chicago',
  'W. Montrose', 'Warren'
];

const UNIT_TYPES = ['Studio', '1BR', '2BR', '3BR', '4BR'];
const FLOORS = ['Ground', 'Middle', 'Top'];

interface AvailableUnitsProps {
  units: AvailableUnit[];
  onRefresh: () => void;
}

export function AvailableUnits({ units, onRefresh }: AvailableUnitsProps) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState({
    property: '',
    unit_number: '',
    unit_type: '',
    floor: '',
    rent_price: '',
    available_date: '',
    notes: '',
  });

  const resetForm = () => {
    setFormData({
      property: '',
      unit_number: '',
      unit_type: '',
      floor: '',
      rent_price: '',
      available_date: '',
      notes: '',
    });
    setValidationErrors({});
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!formData.property) errors.property = 'Property is required';
    if (!formData.unit_number.trim()) errors.unit_number = 'Unit number is required';
    if (!formData.unit_type) errors.unit_type = 'Unit type is required';
    if (!formData.rent_price || Number(formData.rent_price) <= 0) errors.rent_price = 'Valid rent price is required';
    if (!formData.available_date) errors.available_date = 'Available date is required';
    return errors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validateForm();
    setValidationErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('available_units').insert({
        property: formData.property,
        unit_number: formData.unit_number,
        unit_type: formData.unit_type,
        floor: formData.floor || null,
        rent_price: Number(formData.rent_price),
        available_date: formData.available_date,
        notes: formData.notes || null,
        status: 'Available',
      });

      if (error) throw error;

      resetForm();
      setOpen(false);
      onRefresh();
    } catch (error) {
      console.error('Error adding unit:', error);
      alert('Failed to add unit. It may already exist.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to remove this unit?')) return;
    
    const { error } = await supabase.from('available_units').delete().eq('id', id);
    if (error) {
      console.error('Error deleting unit:', error);
      alert('Failed to delete unit');
    } else {
      onRefresh();
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    const { error } = await supabase
      .from('available_units')
      .update({ status: newStatus })
      .eq('id', id);

    if (error) {
      console.error('Error updating status:', error);
      alert('Failed to update status');
    } else {
      onRefresh();
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'Available': return 'default';
      case 'Pending': return 'secondary';
      case 'Leased': return 'outline';
      default: return 'default';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Home className="h-5 w-5" />
          <h3 className="text-lg font-semibold">Available Units ({units.filter(u => u.status === 'Available').length})</h3>
        </div>
        <Dialog open={open} onOpenChange={(isOpen) => { setOpen(isOpen); if (!isOpen) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Add Unit
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Add Available Unit</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Property *</Label>
                  <Select onValueChange={(value) => {
                    setFormData(prev => ({ ...prev, property: value }));
                    setValidationErrors(prev => ({ ...prev, property: '' }));
                  }}>
                    <SelectTrigger className={validationErrors.property ? 'border-red-500' : ''}>
                      <SelectValue placeholder="Select property" />
                    </SelectTrigger>
                    <SelectContent>
                      {PROPERTIES.map(p => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {validationErrors.property && <p className="text-sm text-red-500 mt-1">{validationErrors.property}</p>}
                </div>
                <div>
                  <Label>Unit Number *</Label>
                  <Input
                    value={formData.unit_number}
                    onChange={(e) => {
                      setFormData(prev => ({ ...prev, unit_number: e.target.value }));
                      setValidationErrors(prev => ({ ...prev, unit_number: '' }));
                    }}
                    placeholder="e.g., 301"
                    className={validationErrors.unit_number ? 'border-red-500' : ''}
                  />
                  {validationErrors.unit_number && <p className="text-sm text-red-500 mt-1">{validationErrors.unit_number}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Unit Type *</Label>
                  <Select onValueChange={(value) => {
                    setFormData(prev => ({ ...prev, unit_type: value }));
                    setValidationErrors(prev => ({ ...prev, unit_type: '' }));
                  }}>
                    <SelectTrigger className={validationErrors.unit_type ? 'border-red-500' : ''}>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {UNIT_TYPES.map(t => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {validationErrors.unit_type && <p className="text-sm text-red-500 mt-1">{validationErrors.unit_type}</p>}
                </div>
                <div>
                  <Label>Floor</Label>
                  <Select onValueChange={(value) => setFormData(prev => ({ ...prev, floor: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select floor" />
                    </SelectTrigger>
                    <SelectContent>
                      {FLOORS.map(f => (
                        <SelectItem key={f} value={f}>{f}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Rent Price ($) *</Label>
                  <Input
                    type="number"
                    value={formData.rent_price}
                    onChange={(e) => {
                      setFormData(prev => ({ ...prev, rent_price: e.target.value }));
                      setValidationErrors(prev => ({ ...prev, rent_price: '' }));
                    }}
                    placeholder="1500"
                    className={validationErrors.rent_price ? 'border-red-500' : ''}
                  />
                  {validationErrors.rent_price && <p className="text-sm text-red-500 mt-1">{validationErrors.rent_price}</p>}
                </div>
                <div>
                  <Label>Available Date *</Label>
                  <Input
                    type="date"
                    value={formData.available_date}
                    onChange={(e) => {
                      setFormData(prev => ({ ...prev, available_date: e.target.value }));
                      setValidationErrors(prev => ({ ...prev, available_date: '' }));
                    }}
                    className={validationErrors.available_date ? 'border-red-500' : ''}
                  />
                  {validationErrors.available_date && <p className="text-sm text-red-500 mt-1">{validationErrors.available_date}</p>}
                </div>
              </div>

              <div>
                <Label>Notes</Label>
                <Input
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Any additional notes..."
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Adding...' : 'Add Unit'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {units.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground border rounded-md">
          No available units. Add a unit when one becomes available.
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Property</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Floor</TableHead>
                <TableHead>Rent</TableHead>
                <TableHead>Available</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {units.map((unit) => (
                <TableRow key={unit.id}>
                  <TableCell className="font-medium">{unit.property}</TableCell>
                  <TableCell>{unit.unit_number}</TableCell>
                  <TableCell>{unit.unit_type}</TableCell>
                  <TableCell>{unit.floor || '-'}</TableCell>
                  <TableCell>${unit.rent_price.toLocaleString()}</TableCell>
                  <TableCell>{new Date(unit.available_date).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Select
                      value={unit.status}
                      onValueChange={(value) => handleStatusChange(unit.id, value)}
                    >
                      <SelectTrigger className="w-[110px]">
                        <Badge variant={getStatusBadgeVariant(unit.status) as any}>
                          {unit.status}
                        </Badge>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Available">Available</SelectItem>
                        <SelectItem value="Pending">Pending</SelectItem>
                        <SelectItem value="Leased">Leased</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(unit.id)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
