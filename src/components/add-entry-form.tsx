'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Plus } from 'lucide-react';

interface AddEntryFormProps {
  onEntryAdded: () => void;
}

export function AddEntryForm({ onEntryAdded }: AddEntryFormProps) {
  const [open, setOpen] = useState(false);
  const [isCurrentResident, setIsCurrentResident] = useState(false);
  const [useDateRange, setUseDateRange] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm({
    defaultValues: {
      entry_type: 'Prospect',
      status: 'Active',
      floor_pref: 'No Preference',
      full_name: '',
      email: '',
      phone: '',
      assigned_agent: '',
      property: '',
      unit_type_pref: '',
      preferred_units: '',
      max_budget: '',
      move_in_date: '',
      move_in_date_end: '',
      current_unit_number: '',
      internal_notes: '',
    },
  });

  const handleResidentToggle = (checked: boolean) => {
    setIsCurrentResident(checked);
    setValue('entry_type', checked ? 'Internal Transfer' : 'Prospect');
    if (!checked) {
      setValue('current_unit_number', '');
    }
  };

  const validateForm = (data: Record<string, unknown>) => {
    const errors: Record<string, string> = {};
    
    if (!data.full_name || (data.full_name as string).trim() === '') {
      errors.full_name = 'Full Name is required';
    }
    if (!data.assigned_agent || (data.assigned_agent as string).trim() === '') {
      errors.assigned_agent = 'Assigned Agent is required';
    }
    if (!data.property || (data.property as string).trim() === '') {
      errors.property = 'Property is required';
    }
    if (!data.unit_type_pref || (data.unit_type_pref as string).trim() === '') {
      errors.unit_type_pref = 'Unit Type is required';
    }
    if (!data.move_in_date || (data.move_in_date as string).trim() === '') {
      errors.move_in_date = 'Move-in Date is required';
    }
    
    return errors;
  };

  const onSubmit = async (data: Record<string, unknown>) => {
    const errors = validateForm(data);
    setValidationErrors(errors);
    
    if (Object.keys(errors).length > 0) {
      return;
    }
    
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('waitlist_entries').insert({
        entry_type: data.entry_type as string,
        status: data.status as string,
        full_name: data.full_name as string,
        email: data.email as string,
        phone: data.phone as string,
        assigned_agent: (data.assigned_agent as string) || null,
        property: data.property as string,
        unit_type_pref: data.unit_type_pref as string,
        preferred_units: (data.preferred_units as string) || null,
        floor_pref: data.floor_pref as string,
        max_budget: data.max_budget ? Number(data.max_budget) : 0,
        move_in_date: data.move_in_date as string,
        move_in_date_end: useDateRange ? (data.move_in_date_end as string) || null : null,
        current_unit_number: (data.current_unit_number as string) || null,
        internal_notes: (data.internal_notes as string) || null,
      });

      if (error) throw error;

      reset();
      setIsCurrentResident(false);
      setUseDateRange(false);
      setOpen(false);
      onEntryAdded();
    } catch (error) {
      console.error('Error adding entry:', error);
      alert('Failed to add entry. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Entry
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Waitlist Entry</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="isCurrentResident"
              checked={isCurrentResident}
              onChange={(e) => handleResidentToggle(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="isCurrentResident">Current Resident (Internal Transfer)</Label>
          </div>

          {isCurrentResident && (
            <div>
              <Label htmlFor="current_unit_number">Current Unit Number</Label>
              <Input
                id="current_unit_number"
                {...register('current_unit_number')}
                placeholder="e.g., 301"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="full_name">Full Name *</Label>
              <Input 
                id="full_name" 
                {...register('full_name')} 
                className={validationErrors.full_name ? 'border-red-500 focus:ring-red-500' : ''}
              />
              {validationErrors.full_name && (
                <p className="text-sm text-red-500 mt-1">{validationErrors.full_name}</p>
              )}
            </div>

            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...register('email')} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" {...register('phone')} placeholder="(555) 123-4567" />
            </div>

            <div>
              <Label htmlFor="assigned_agent">Assigned Agent *</Label>
              <Select
                onValueChange={(value) => {
                  setValue('assigned_agent', value);
                  setValidationErrors(prev => ({ ...prev, assigned_agent: '' }));
                }}
              >
                <SelectTrigger className={validationErrors.assigned_agent ? 'border-red-500' : ''}>
                  <SelectValue placeholder="Select agent" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Matthew Kaleb">Matthew Kaleb</SelectItem>
                  <SelectItem value="Michael Dillon">Michael Dillon</SelectItem>
                  <SelectItem value="Unassigned">Unassigned Agent</SelectItem>
                </SelectContent>
              </Select>
              {validationErrors.assigned_agent && (
                <p className="text-sm text-red-500 mt-1">{validationErrors.assigned_agent}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="property">Property *</Label>
              <Select onValueChange={(value) => {
                setValue('property', value);
                setValidationErrors(prev => ({ ...prev, property: '' }));
              }}>
                <SelectTrigger className={validationErrors.property ? 'border-red-500' : ''}>
                  <SelectValue placeholder="Select property" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="246 Green Bay">246 Green Bay</SelectItem>
                  <SelectItem value="440 Green Bay">440 Green Bay</SelectItem>
                  <SelectItem value="546 Green Bay">546 Green Bay</SelectItem>
                  <SelectItem value="Broadway">Broadway</SelectItem>
                  <SelectItem value="Countryside C">Countryside C</SelectItem>
                  <SelectItem value="Countryside T">Countryside T</SelectItem>
                  <SelectItem value="Elston">Elston</SelectItem>
                  <SelectItem value="Fullerton">Fullerton</SelectItem>
                  <SelectItem value="Greenleaf">Greenleaf</SelectItem>
                  <SelectItem value="Kedzie">Kedzie</SelectItem>
                  <SelectItem value="Kennedy">Kennedy</SelectItem>
                  <SelectItem value="Liberty">Liberty</SelectItem>
                  <SelectItem value="N. Clark">N. Clark</SelectItem>
                  <SelectItem value="Park">Park</SelectItem>
                  <SelectItem value="Rogers">Rogers</SelectItem>
                  <SelectItem value="Sheffield">Sheffield</SelectItem>
                  <SelectItem value="Talman">Talman</SelectItem>
                  <SelectItem value="W. Chicago">W. Chicago</SelectItem>
                  <SelectItem value="W. Montrose">W. Montrose</SelectItem>
                  <SelectItem value="Warren">Warren</SelectItem>
                </SelectContent>
              </Select>
              {validationErrors.property && (
                <p className="text-sm text-red-500 mt-1">{validationErrors.property}</p>
              )}
            </div>

            <div>
              <Label htmlFor="unit_type_pref">Unit Type Preference *</Label>
              <Select onValueChange={(value) => {
                setValue('unit_type_pref', value);
                setValidationErrors(prev => ({ ...prev, unit_type_pref: '' }));
              }}>
                <SelectTrigger className={validationErrors.unit_type_pref ? 'border-red-500' : ''}>
                  <SelectValue placeholder="Select unit type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Studio">Studio</SelectItem>
                  <SelectItem value="1BR">1BR</SelectItem>
                  <SelectItem value="2BR">2BR</SelectItem>
                  <SelectItem value="3BR">3BR</SelectItem>
                  <SelectItem value="4BR">4BR</SelectItem>
                </SelectContent>
              </Select>
              {validationErrors.unit_type_pref && (
                <p className="text-sm text-red-500 mt-1">{validationErrors.unit_type_pref}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="preferred_units">Preferred Unit Numbers</Label>
              <Input
                id="preferred_units"
                {...register('preferred_units')}
                placeholder="e.g., 101, 205, 310"
              />
              <p className="text-xs text-muted-foreground mt-1">Separate multiple units with commas</p>
            </div>

            <div>
              <Label htmlFor="floor_pref">Floor Preference</Label>
              <Select
                defaultValue="No Preference"
                onValueChange={(value) => setValue('floor_pref', value as any)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select floor preference" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Ground">Ground</SelectItem>
                  <SelectItem value="Middle">Middle</SelectItem>
                  <SelectItem value="Top">Top</SelectItem>
                  <SelectItem value="No Preference">No Preference</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="max_budget">Max Budget ($)</Label>
              <Input
                id="max_budget"
                type="number"
                {...register('max_budget')}
                placeholder="2000"
              />
            </div>
          </div>

          <div className="space-y-2">
            {useDateRange ? (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="move_in_date">Move-in Start Date *</Label>
                  <Input 
                    id="move_in_date" 
                    type="date" 
                    {...register('move_in_date')} 
                    className={validationErrors.move_in_date ? 'border-red-500 focus:ring-red-500' : ''}
                    onChange={(e) => {
                      register('move_in_date').onChange(e);
                      setValidationErrors(prev => ({ ...prev, move_in_date: '' }));
                    }}
                  />
                  {validationErrors.move_in_date && (
                    <p className="text-sm text-red-500 mt-1">{validationErrors.move_in_date}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="move_in_date_end">Move-in End Date</Label>
                  <Input 
                    id="move_in_date_end" 
                    type="date" 
                    {...register('move_in_date_end')} 
                  />
                </div>
              </div>
            ) : (
              <div>
                <Label htmlFor="move_in_date">Move-in Date *</Label>
                <Input 
                  id="move_in_date" 
                  type="date" 
                  {...register('move_in_date')} 
                  className={validationErrors.move_in_date ? 'border-red-500 focus:ring-red-500' : ''}
                  onChange={(e) => {
                    register('move_in_date').onChange(e);
                    setValidationErrors(prev => ({ ...prev, move_in_date: '' }));
                  }}
                />
                {validationErrors.move_in_date && (
                  <p className="text-sm text-red-500 mt-1">{validationErrors.move_in_date}</p>
                )}
              </div>
            )}
            
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="useDateRange"
                checked={useDateRange}
                onChange={(e) => setUseDateRange(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="useDateRange" className="text-sm font-normal cursor-pointer">Use move-in date range</Label>
            </div>
            {useDateRange && (
              <p className="text-xs text-muted-foreground">Entry will match units available between start and end dates</p>
            )}
          </div>

          <div>
            <Label htmlFor="internal_notes">Internal Notes</Label>
            <textarea
              id="internal_notes"
              {...register('internal_notes')}
              className="w-full min-h-[80px] px-3 py-2 border rounded-md text-sm"
              placeholder="Any additional notes..."
            />
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Adding...' : 'Add Entry'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
