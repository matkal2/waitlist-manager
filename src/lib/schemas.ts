import { z } from 'zod';

export const waitlistEntrySchema = z.object({
  entry_type: z.enum(['Internal Transfer', 'Prospect']),
  status: z.enum(['Active', 'Contacted', 'Leased', 'Closed']),
  full_name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  phone: z.string().min(10, 'Phone number must be at least 10 digits'),
  assigned_agent: z.string().optional().nullable(),
  unit_type_pref: z.string().min(1, 'Please select a unit type'),
  floor_pref: z.enum(['Ground', 'Middle', 'Top', 'No Preference']),
  max_budget: z.coerce.number().positive('Budget must be a positive number'),
  move_in_date: z.string().min(1, 'Please select a move-in date'),
  current_unit_number: z.string().optional().nullable(),
  internal_notes: z.string().optional().nullable(),
});

export type WaitlistEntryFormData = z.infer<typeof waitlistEntrySchema>;

export const unitMatcherSchema = z.object({
  unit_type: z.string().min(1, 'Please select a unit type'),
  floor: z.enum(['Ground', 'Middle', 'Top', 'Any']),
  price: z.coerce.number().positive('Price must be a positive number'),
  available_date: z.string().min(1, 'Please select an available date'),
});

export type UnitMatcherFormData = z.infer<typeof unitMatcherSchema>;
