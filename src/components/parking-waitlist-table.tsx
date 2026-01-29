'use client';

import { useState, useEffect, useRef } from 'react';
import { ParkingWaitlist, ParkingWaitlistType, ParkingWaitlistStatus } from '@/types/database';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import { Plus, Trash2, Pencil, Search, Download, X, User } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { PROPERTY_UNITS } from '@/lib/property-units';

interface ParkingWaitlistTableProps {
  entries: ParkingWaitlist[];
  properties: string[];
  onRefresh: () => void;
  currentUserEmail?: string;
}

const WAITLIST_TYPES: { value: ParkingWaitlistType; label: string; priority: number }[] = [
  { value: '1st Spot', label: '1st Spot', priority: 1 },
  { value: 'Indoor Upgrade', label: 'Indoor Upgrade', priority: 2 },
  { value: '2nd Spot', label: '2nd Spot', priority: 3 },
];

const STATUSES: ParkingWaitlistStatus[] = ['Active', 'Offered', 'Assigned', 'Cancelled'];

const STATUS_COLORS: Record<ParkingWaitlistStatus, string> = {
  'Active': 'bg-blue-500',
  'Offered': 'bg-yellow-500',
  'Assigned': 'bg-green-500',
  'Cancelled': 'bg-gray-400',
};

const TYPE_COLORS: Record<ParkingWaitlistType, string> = {
  '1st Spot': 'bg-purple-500',
  'Indoor Upgrade': 'bg-teal-500',
  '2nd Spot': 'bg-indigo-400',
};

// Format date without timezone shift
const formatDateLocal = (dateString: string) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString();
};

export function ParkingWaitlistTable({ entries, properties, onRefresh, currentUserEmail }: ParkingWaitlistTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('Active');
  const [propertyFilter, setPropertyFilter] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  // Add/Edit dialog state
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<ParkingWaitlist | null>(null);
  const [formData, setFormData] = useState({
    tenant_name: '',
    unit_number: '',
    email: '',
    phone: '',
    property: '',
    waitlist_type: '1st Spot' as ParkingWaitlistType,
    current_spot_number: '',
    preferred_spot_type: 'Any' as string,
    status: 'Active' as ParkingWaitlistStatus,
    notes: '',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Directory state for tenant autocomplete
  const [directory, setDirectory] = useState<{ tenantCode: string; residentName: string; unitNumber?: string; property?: string }[]>([]);
  const [tenantSearch, setTenantSearch] = useState('');
  const [showTenantDropdown, setShowTenantDropdown] = useState(false);
  const [isLoadingDirectory, setIsLoadingDirectory] = useState(false);
  const [selectedTenantCode, setSelectedTenantCode] = useState('');
  const tenantInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Get units for selected property
  const getUnitsForProperty = (property: string) => {
    const key = property as keyof typeof PROPERTY_UNITS;
    return PROPERTY_UNITS[key] || [];
  };

  // Fetch directory when dialog opens
  useEffect(() => {
    if (isAddDialogOpen && directory.length === 0) {
      setIsLoadingDirectory(true);
      fetch('/api/directory')
        .then(res => res.json())
        .then(data => {
          setDirectory(data.directory || []);
        })
        .catch(err => console.error('Failed to load directory:', err))
        .finally(() => setIsLoadingDirectory(false));
    }
  }, [isAddDialogOpen, directory.length]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
          tenantInputRef.current && !tenantInputRef.current.contains(event.target as Node)) {
        setShowTenantDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter directory based on search
  const filteredDirectory = directory.filter(entry => {
    const searchLower = tenantSearch.toLowerCase();
    return entry.residentName.toLowerCase().includes(searchLower) ||
           entry.tenantCode.toLowerCase().includes(searchLower);
  }).slice(0, 20);

  // Property name mapping (directory names to parking property names)
  const propertyNameMap: Record<string, string> = {
    'Broadway': 'Broadway',
    'Granville': 'Granville',
    'Pratt': 'Pratt',
    'West Montrose': 'W. Montrose',
    'Glenlake': 'Glenlake',
    'North Clark': 'North Clark',
    'N. Clark': 'North Clark',
    '246 Green Bay': 'Green Bay 246',
    '440 Green Bay': 'Green Bay 440',
    '546 Green Bay': 'Green Bay 546',
    'Countryside C': 'Countryside C',
    'Countryside T': 'Countryside T',
    'Elston': 'Elston',
    'Kennedy': 'Kennedy',
    'Park': 'Park',
    'Rogers': 'Rogers',
    'Talman': 'Talman',
    'Greenleaf': 'Greenleaf',
    'Liberty': 'Liberty',
    'Fullerton': 'Fullerton',
    'Kedzie': 'Kedzie',
    'Sheffield': 'Sheffield',
    'Warren': 'Warren',
    'W. Chicago': 'W. Chicago',
  };

  // Handle tenant selection from directory
  const handleTenantSelect = (entry: { tenantCode: string; residentName: string; unitNumber?: string; property?: string }) => {
    setFormData(prev => ({
      ...prev,
      tenant_name: entry.residentName,
      property: entry.property ? (propertyNameMap[entry.property] || entry.property) : prev.property,
      unit_number: entry.unitNumber || prev.unit_number,
    }));
    setSelectedTenantCode(entry.tenantCode);
    setTenantSearch(entry.residentName);
    setShowTenantDropdown(false);
    setFormErrors(prev => ({ ...prev, tenant_name: '', property: '', unit_number: '' }));
  };

  // Clear tenant selection
  const clearTenantSelection = () => {
    setFormData(prev => ({
      ...prev,
      tenant_name: '',
      property: '',
      unit_number: '',
    }));
    setSelectedTenantCode('');
    setTenantSearch('');
    tenantInputRef.current?.focus();
  };

  const resetForm = () => {
    setFormData({
      tenant_name: '',
      unit_number: '',
      email: '',
      phone: '',
      property: '',
      waitlist_type: '1st Spot',
      current_spot_number: '',
      preferred_spot_type: 'Any',
      status: 'Active',
      notes: '',
    });
    setFormErrors({});
    setEditingEntry(null);
    setTenantSearch('');
    setSelectedTenantCode('');
    setShowTenantDropdown(false);
  };

  const openAddDialog = () => {
    resetForm();
    setIsAddDialogOpen(true);
  };

  const openEditDialog = (entry: ParkingWaitlist) => {
    setEditingEntry(entry);
    setFormData({
      tenant_name: entry.tenant_name,
      unit_number: entry.unit_number,
      email: entry.email || '',
      phone: entry.phone || '',
      property: entry.property,
      waitlist_type: entry.waitlist_type,
      current_spot_number: entry.current_spot_number || '',
      preferred_spot_type: entry.preferred_spot_type || 'Any',
      status: entry.status,
      notes: entry.notes || '',
    });
    setTenantSearch(entry.tenant_name);
    setSelectedTenantCode('');
    setFormErrors({});
    setIsAddDialogOpen(true);
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!formData.tenant_name.trim()) errors.tenant_name = 'Tenant name is required';
    if (!formData.property) errors.property = 'Property is required';
    if (!formData.unit_number) errors.unit_number = 'Unit number is required';
    if (!formData.waitlist_type) errors.waitlist_type = 'Waitlist type is required';
    
    // For Indoor Upgrade, current spot is required
    if (formData.waitlist_type === 'Indoor Upgrade' && !formData.current_spot_number.trim()) {
      errors.current_spot_number = 'Current spot is required for Indoor Upgrade';
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;
    
    setIsSubmitting(true);
    
    try {
      const priority = WAITLIST_TYPES.find(t => t.value === formData.waitlist_type)?.priority || 3;
      
      const dataToSave = {
        tenant_name: formData.tenant_name.trim(),
        unit_number: formData.unit_number,
        email: formData.email.trim() || null,
        phone: formData.phone.trim() || null,
        property: formData.property,
        waitlist_type: formData.waitlist_type,
        current_spot_number: formData.current_spot_number.trim() || null,
        preferred_spot_type: formData.preferred_spot_type === 'Any' ? null : formData.preferred_spot_type,
        status: formData.status,
        notes: formData.notes.trim() || null,
        priority_order: priority,
      };

      if (editingEntry) {
        // Update existing entry
        const { error } = await supabase
          .from('parking_waitlist')
          .update(dataToSave)
          .eq('id', editingEntry.id);
        
        if (error) {
          console.error('Supabase update error:', error);
          throw new Error(error.message || 'Update failed');
        }
      } else {
        // Insert new entry
        const { error } = await supabase
          .from('parking_waitlist')
          .insert(dataToSave);
        
        if (error) {
          console.error('Supabase insert error:', error);
          throw new Error(error.message || 'Insert failed');
        }
      }
      
      setIsAddDialogOpen(false);
      resetForm();
      onRefresh();
    } catch (error: unknown) {
      console.error('Error saving waitlist entry:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Failed to save entry: ${errorMessage}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to remove this waitlist entry?')) return;
    
    try {
      const { error } = await supabase
        .from('parking_waitlist')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      onRefresh();
    } catch (error) {
      console.error('Error deleting entry:', error);
      alert('Failed to delete entry. Please try again.');
    }
  };

  const handleStatusChange = async (id: string, newStatus: ParkingWaitlistStatus) => {
    try {
      const { error } = await supabase
        .from('parking_waitlist')
        .update({ status: newStatus })
        .eq('id', id);
      
      if (error) throw error;
      onRefresh();
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Failed to update status. Please try again.');
    }
  };

  // Bulk delete selected entries
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedIds.size} selected entries?`)) return;
    
    try {
      const { error } = await supabase
        .from('parking_waitlist')
        .delete()
        .in('id', Array.from(selectedIds));
      
      if (error) throw error;
      setSelectedIds(new Set());
      onRefresh();
    } catch (error) {
      console.error('Error bulk deleting:', error);
      alert('Failed to delete entries. Please try again.');
    }
  };

  // Bulk status change
  const handleBulkStatusChange = async (newStatus: ParkingWaitlistStatus) => {
    if (selectedIds.size === 0) return;
    
    try {
      const { error } = await supabase
        .from('parking_waitlist')
        .update({ status: newStatus })
        .in('id', Array.from(selectedIds));
      
      if (error) throw error;
      setSelectedIds(new Set());
      onRefresh();
    } catch (error) {
      console.error('Error bulk updating status:', error);
      alert('Failed to update entries. Please try again.');
    }
  };

  // Export to CSV
  const exportToCSV = () => {
    const csv = [
      ['Tenant Name', 'Property', 'Unit', 'Waitlist Type', 'Current Spot', 'Status', 'Email', 'Phone', 'Date Added', 'Notes'].join(','),
      ...filteredEntries.map(e => [
        `"${e.tenant_name}"`,
        `"${e.property}"`,
        `"${e.unit_number}"`,
        `"${e.waitlist_type}"`,
        `"${e.current_spot_number || ''}"`,
        `"${e.status}"`,
        `"${e.email || ''}"`,
        `"${e.phone || ''}"`,
        `"${new Date(e.created_at).toLocaleDateString()}"`,
        `"${(e.notes || '').replace(/"/g, '""')}"`
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `parking-waitlist-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  // Toggle selection
  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  // Select all filtered entries
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredEntries.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredEntries.map(e => e.id)));
    }
  };

  // Filter and sort entries
  const filteredEntries = entries
    .filter(entry => {
      if (typeFilter !== 'all' && entry.waitlist_type !== typeFilter) return false;
      if (statusFilter !== 'all' && entry.status !== statusFilter) return false;
      if (propertyFilter !== 'all' && entry.property !== propertyFilter) return false;
      if (searchTerm) {
        const query = searchTerm.toLowerCase();
        return (
          entry.tenant_name.toLowerCase().includes(query) ||
          entry.unit_number.toLowerCase().includes(query) ||
          (entry.current_spot_number && entry.current_spot_number.toLowerCase().includes(query))
        );
      }
      return true;
    })
    .sort((a, b) => {
      // Sort by priority (1st Spot first, then Indoor, then 2nd Spot)
      const priorityA = WAITLIST_TYPES.find(t => t.value === a.waitlist_type)?.priority || 3;
      const priorityB = WAITLIST_TYPES.find(t => t.value === b.waitlist_type)?.priority || 3;
      if (priorityA !== priorityB) return priorityA - priorityB;
      // Then by created_at (oldest first - FIFO within same type)
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

  // Count by type
  const countByType = (type: ParkingWaitlistType) => 
    entries.filter(e => e.waitlist_type === type && e.status === 'Active').length;

  return (
    <div className="space-y-4">
      {/* Header with Add button and Export */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <Badge className={`${TYPE_COLORS['1st Spot']} text-white`}>
            1st Spot: {countByType('1st Spot')}
          </Badge>
          <Badge className={`${TYPE_COLORS['Indoor Upgrade']} text-white`}>
            Indoor: {countByType('Indoor Upgrade')}
          </Badge>
          <Badge className={`${TYPE_COLORS['2nd Spot']} text-white`}>
            2nd Spot: {countByType('2nd Spot')}
          </Badge>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportToCSV}>
            <Download className="h-4 w-4 mr-1" />
            Export
          </Button>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openAddDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Add to Waitlist
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {editingEntry ? 'Edit Waitlist Entry' : 'Add to Parking Waitlist'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              {/* Tenant Name - Autocomplete from Directory */}
              <div className="relative">
                <Label>Tenant Name *</Label>
                <div className="relative">
                  {formData.tenant_name && !editingEntry ? (
                    // Selected tenant display
                    <div className={`flex items-center justify-between px-3 py-2 border rounded-md bg-muted/30 ${formErrors.tenant_name ? 'border-red-500' : ''}`}>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{formData.tenant_name}</span>
                        {selectedTenantCode && (
                          <Badge variant="outline" className="text-xs">{selectedTenantCode}</Badge>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={clearTenantSelection}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : editingEntry ? (
                    // When editing, show a simple disabled input
                    <Input
                      value={formData.tenant_name}
                      disabled
                      className="bg-muted/50"
                    />
                  ) : (
                    // Search input for new entries
                    <>
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        ref={tenantInputRef}
                        value={tenantSearch}
                        onChange={(e) => {
                          setTenantSearch(e.target.value);
                          setShowTenantDropdown(true);
                          setFormErrors(prev => ({ ...prev, tenant_name: '' }));
                        }}
                        onFocus={() => setShowTenantDropdown(true)}
                        placeholder={isLoadingDirectory ? "Loading directory..." : "Search resident name..."}
                        className={`pl-10 ${formErrors.tenant_name ? 'border-red-500' : ''}`}
                        disabled={isLoadingDirectory}
                      />
                    </>
                  )}
                  
                  {/* Dropdown results */}
                  {showTenantDropdown && !formData.tenant_name && tenantSearch.length > 0 && (
                    <div 
                      ref={dropdownRef}
                      className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-[200px] overflow-y-auto"
                    >
                      {filteredDirectory.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-muted-foreground">
                          No residents found matching &quot;{tenantSearch}&quot;
                        </div>
                      ) : (
                        filteredDirectory.map((entry, idx) => (
                          <button
                            key={`${entry.tenantCode}-${idx}`}
                            type="button"
                            className="w-full px-3 py-2 text-left hover:bg-muted flex items-center justify-between text-sm"
                            onClick={() => handleTenantSelect(entry)}
                          >
                            <div className="flex flex-col">
                              <span className="font-medium">{entry.residentName}</span>
                              {entry.property && entry.unitNumber && (
                                <span className="text-xs text-muted-foreground">
                                  {entry.property} - Unit {entry.unitNumber}
                                </span>
                              )}
                            </div>
                            <Badge variant="outline" className="text-xs ml-2">{entry.tenantCode}</Badge>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
                {formErrors.tenant_name && (
                  <p className="text-red-500 text-xs mt-1">{formErrors.tenant_name}</p>
                )}
                {!editingEntry && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Start typing to search the resident directory
                  </p>
                )}
              </div>

              {/* Property & Unit - Auto-populated */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Property *</Label>
                  <Input
                    value={formData.property || ''}
                    disabled
                    placeholder="Auto-filled from tenant"
                    className={`bg-muted/50 ${formErrors.property ? 'border-red-500' : ''}`}
                  />
                  {formErrors.property && (
                    <p className="text-red-500 text-xs mt-1">{formErrors.property}</p>
                  )}
                </div>
                <div>
                  <Label>Unit *</Label>
                  <Input
                    value={formData.unit_number || ''}
                    disabled
                    placeholder="Auto-filled from tenant"
                    className={`bg-muted/50 ${formErrors.unit_number ? 'border-red-500' : ''}`}
                  />
                  {formErrors.unit_number && (
                    <p className="text-red-500 text-xs mt-1">{formErrors.unit_number}</p>
                  )}
                </div>
              </div>

              {/* Waitlist Type */}
              <div>
                <Label>Waitlist Type *</Label>
                <Select
                  value={formData.waitlist_type}
                  onValueChange={(value) => setFormData({ ...formData, waitlist_type: value as ParkingWaitlistType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WAITLIST_TYPES.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label} (Priority {type.priority})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formErrors.waitlist_type && (
                  <p className="text-red-500 text-xs mt-1">{formErrors.waitlist_type}</p>
                )}
              </div>

              {/* Current Spot (for Indoor Upgrade or 2nd Spot) */}
              {(formData.waitlist_type === 'Indoor Upgrade' || formData.waitlist_type === '2nd Spot') && (
                <div>
                  <Label>
                    Current Spot {formData.waitlist_type === 'Indoor Upgrade' ? '*' : '(optional)'}
                  </Label>
                  <Input
                    value={formData.current_spot_number}
                    onChange={(e) => setFormData({ ...formData, current_spot_number: e.target.value })}
                    placeholder="e.g., Outdoor-15"
                  />
                  {formErrors.current_spot_number && (
                    <p className="text-red-500 text-xs mt-1">{formErrors.current_spot_number}</p>
                  )}
                </div>
              )}

              {/* Preferred Spot Type */}
              <div>
                <Label>Preferred Spot Type</Label>
                <Select
                  value={formData.preferred_spot_type}
                  onValueChange={(value) => setFormData({ ...formData, preferred_spot_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Any">Any</SelectItem>
                    <SelectItem value="Indoor">Indoor</SelectItem>
                    <SelectItem value="Outdoor">Outdoor</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Contact Info Row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="email@example.com"
                  />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="(555) 123-4567"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <Label>Notes</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Any additional notes..."
                  rows={2}
                />
              </div>

              {/* Status (only when editing) */}
              {editingEntry && (
                <div>
                  <Label>Status</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value) => setFormData({ ...formData, status: value as ParkingWaitlistStatus })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map(status => (
                        <SelectItem key={status} value={status}>{status}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Submit Button */}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSubmit} disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : editingEntry ? 'Save Changes' : 'Add to Waitlist'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Bulk Actions Bar - shown when items selected */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <div className="flex gap-2">
            <Select onValueChange={(value) => handleBulkStatusChange(value as ParkingWaitlistStatus)}>
              <SelectTrigger className="w-[140px] h-8">
                <SelectValue placeholder="Change Status" />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map(status => (
                  <SelectItem key={status} value={status}>{status}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, unit, or spot..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {WAITLIST_TYPES.map(type => (
              <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {STATUSES.map(status => (
              <SelectItem key={status} value={status}>{status}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={propertyFilter} onValueChange={setPropertyFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Properties" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Properties</SelectItem>
            {properties.map(p => (
              <SelectItem key={p} value={p}>{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]">
                <Checkbox 
                  checked={filteredEntries.length > 0 && selectedIds.size === filteredEntries.length}
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead className="w-[40px]">#</TableHead>
              <TableHead>Tenant</TableHead>
              <TableHead className="hidden md:table-cell">Property / Unit</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="hidden sm:table-cell">Current Spot</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden lg:table-cell">Date Added</TableHead>
              <TableHead className="w-[80px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredEntries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  No waitlist entries found
                </TableCell>
              </TableRow>
            ) : (
              filteredEntries.map((entry, index) => (
                <TableRow key={entry.id} className={selectedIds.has(entry.id) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}>
                  <TableCell>
                    <Checkbox 
                      checked={selectedIds.has(entry.id)}
                      onCheckedChange={() => toggleSelect(entry.id)}
                    />
                  </TableCell>
                  <TableCell className="font-medium text-muted-foreground">
                    {index + 1}
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{entry.tenant_name}</div>
                      {entry.phone && (
                        <div className="text-xs text-muted-foreground">{entry.phone}</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div>
                      <div className="font-medium">{entry.property}</div>
                      <div className="text-xs text-muted-foreground">Unit {entry.unit_number}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={`${TYPE_COLORS[entry.waitlist_type]} text-white text-xs`}>
                      {entry.waitlist_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {entry.current_spot_number || '-'}
                  </TableCell>
                  <TableCell>
                    <Badge className={`${STATUS_COLORS[entry.status]} text-white text-xs`}>
                      {entry.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                    {formatDateLocal(entry.created_at)}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(entry)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(entry.id)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <div className="px-4 py-2 text-sm text-muted-foreground border-t">
          Showing {filteredEntries.length} of {entries.length} entries
        </div>
      </div>
    </div>
  );
}
