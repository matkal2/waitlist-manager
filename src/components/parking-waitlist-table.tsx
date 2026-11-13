'use client';

import { Fragment, useState, useEffect, useRef } from 'react';
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
import { Plus, Trash2, Pencil, Search, Download, X, User, Users, Car, Warehouse, ParkingCircle, ChevronDown, ChevronRight, Sparkles, AlertTriangle, CheckCircle } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { PROPERTY_UNITS } from '@/lib/property-units';
import type { ChangeFormPrefill } from '@/components/parking-change-form';
import { MatchableSpot, entryMatchesSpot, getSpotMatches, isSpotOpenForWaitlist, normalizePersonName } from '@/lib/parking-matching';

interface ParkingWaitlistTableProps {
  entries: ParkingWaitlist[];
  properties: string[];
  onRefresh: () => void;
  currentUserEmail?: string;
  spots?: MatchableSpot[];
  submitterName?: string;
  onAssign?: (entry: ParkingWaitlist, prefill: ChangeFormPrefill) => void;
}

const WAITLIST_TYPES: { value: ParkingWaitlistType; label: string; priority: number }[] = [
  { value: '1st Spot', label: '1st Spot', priority: 1 },
  { value: 'Indoor Upgrade', label: 'Indoor Upgrade', priority: 2 },
  { value: '2nd Spot', label: '2nd Spot', priority: 3 },
];

const TYPE_DESCRIPTIONS: Record<string, string> = {
  '1st Spot': 'Resident has no parking yet',
  'Indoor Upgrade': 'Move from an outdoor spot to indoor',
  '2nd Spot': 'Resident wants an additional spot',
};

const STATUSES: ParkingWaitlistStatus[] = ['Active', 'Offered', 'Assigned', 'Cancelled'];

const STATUS_HELP: Record<ParkingWaitlistStatus, string> = {
  'Active': 'Waiting for a spot and shown as a match for open spots.',
  'Offered': 'A spot has been offered; no longer matched to other spots.',
  'Assigned': 'Has their spot; hidden from the waitlist.',
  'Cancelled': 'No longer wants a spot; hidden from the waitlist.',
};

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

export function ParkingWaitlistTable({ entries, properties, onRefresh, currentUserEmail, spots = [], onAssign }: ParkingWaitlistTableProps) {
  const [notInDirectoryOnly, setNotInDirectoryOnly] = useState(false);
  const [directoryLoaded, setDirectoryLoaded] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('Active');
  const [selectedProperty, setSelectedProperty] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
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

  // Directory feeds tenant autocomplete and the "Not in Directory" check
  useEffect(() => {
    setIsLoadingDirectory(true);
    fetch('/api/directory')
      .then(res => res.json())
      .then(data => {
        const list = data.directory || [];
        setDirectory(list);
        setDirectoryLoaded(list.length > 0);
      })
      .catch(err => console.error('Failed to load directory:', err))
      .finally(() => setIsLoadingDirectory(false));
  }, []);

  const directoryNames = new Set(directory.map(d => normalizePersonName(d.residentName)));
  const isMissingFromDirectory = (entry: ParkingWaitlist) =>
    directoryLoaded &&
    (entry.status === 'Active' || entry.status === 'Offered') &&
    !directoryNames.has(normalizePersonName(entry.tenant_name));
  const missingCount = entries.filter(isMissingFromDirectory).length;

  const openSpots = spots.filter(isSpotOpenForWaitlist);
  const getEntryMatches = (entry: ParkingWaitlist) =>
    openSpots
      .filter(spot => entryMatchesSpot(entry, spot))
      .map(spot => ({ spot, rank: getSpotMatches(spot, entries).findIndex(e => e.id === entry.id) + 1 }))
      .sort((a, b) =>
        (a.spot.status === 'Vacant' ? 0 : 1) - (b.spot.status === 'Vacant' ? 0 : 1) ||
        a.rank - b.rank ||
        new Date(a.spot.available_date || 0).getTime() - new Date(b.spot.available_date || 0).getTime()
      );

  const resolveSpotCode = (entry: ParkingWaitlist, value: string | null) => {
    if (!value) return '';
    const v = value.trim().toLowerCase();
    const found = spots.find(s => s.full_space_code.toLowerCase() === v) ||
      spots.find(s => s.property === entry.property && (s.spot_number || '').toLowerCase() === v);
    return found ? found.full_space_code : value.trim();
  };

  const openAssign = (entry: ParkingWaitlist, spot?: MatchableSpot) => {
    if (!onAssign) return;
    const isUpgrade = entry.waitlist_type === 'Indoor Upgrade';
    const today = new Date().toISOString().split('T')[0];
    const available = spot && spot.status !== 'Vacant' ? (spot.available_date || today).split('T')[0] : today;
    const tenant = directory.find(d =>
      normalizePersonName(d.residentName) === normalizePersonName(entry.tenant_name) &&
      (!d.unitNumber || d.unitNumber === entry.unit_number)
    ) || directory.find(d => normalizePersonName(d.residentName) === normalizePersonName(entry.tenant_name));
    onAssign(entry, {
      changeType: isUpgrade ? 'Transfer' : 'Add',
      tenantName: entry.tenant_name,
      tenantCode: tenant?.tenantCode || '',
      property: entry.property,
      unit: entry.unit_number,
      primarySpace: isUpgrade ? resolveSpotCode(entry, entry.current_spot_number) : spot?.full_space_code || '',
      transferToSpace: isUpgrade ? spot?.full_space_code || '' : '',
      effectiveDate: spot ? (available > today ? available : today) : '',
      notes: `Assigned from parking waitlist (${entry.waitlist_type})`,
    });
  };

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

  // Spots a resident holds now or is set to take over
  const getTenantSpots = (tenantCode: string) =>
    tenantCode ? spots.filter(sp => sp.tenant_code === tenantCode || sp.future_tenant_code === tenantCode) : [];
  const isIndoorSpot = (sp: MatchableSpot) => (sp.spot_type || '').toLowerCase().startsWith('indoor');
  const selectedTenantSpots = getTenantSpots(selectedTenantCode);

  // Handle tenant selection from directory
  const handleTenantSelect = (entry: { tenantCode: string; residentName: string; unitNumber?: string; property?: string }) => {
    const held = getTenantSpots(entry.tenantCode);
    const outdoor = held.find(sp => !isIndoorSpot(sp));
    setFormData(prev => ({
      ...prev,
      tenant_name: entry.residentName,
      property: entry.property ? (propertyNameMap[entry.property] || entry.property) : prev.property,
      unit_number: entry.unitNumber || prev.unit_number,
      waitlist_type: held.length === 0 ? '1st Spot' : prev.waitlist_type === '1st Spot' ? '2nd Spot' : prev.waitlist_type,
      current_spot_number: held.length === 0
        ? ''
        : (prev.waitlist_type === 'Indoor Upgrade' && outdoor ? outdoor : held[0]).full_space_code,
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
      current_spot_number: '',
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
    setSelectedTenantCode(
      directory.find(d =>
        normalizePersonName(d.residentName) === normalizePersonName(entry.tenant_name) &&
        (!d.unitNumber || d.unitNumber === entry.unit_number)
      )?.tenantCode || ''
    );
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

    const duplicate = entries.find(e =>
      e.id !== editingEntry?.id &&
      (e.status === 'Active' || e.status === 'Offered') &&
      normalizePersonName(e.tenant_name) === normalizePersonName(formData.tenant_name) &&
      e.unit_number === formData.unit_number &&
      e.waitlist_type === formData.waitlist_type
    );
    if (duplicate) {
      setFormErrors({
        tenant_name: `${duplicate.tenant_name} is already on the ${duplicate.waitlist_type} waitlist (added ${formatDateLocal(duplicate.created_at)}, ${duplicate.status}).`,
      });
      return;
    }
    
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
        current_spot_number: (() => {
          if (formData.waitlist_type === '1st Spot') return null;
          if (selectedTenantSpots.length > 0 && formData.waitlist_type !== 'Indoor Upgrade') {
            return selectedTenantSpots.map(sp => sp.full_space_code).join(', ');
          }
          return formData.current_spot_number.trim() || null;
        })(),
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
      ...visibleEntries.map(e => [
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
    if (visibleEntries.length > 0 && visibleEntries.every(e => selectedIds.has(e.id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleEntries.map(e => e.id)));
    }
  };

  // Filter and sort entries
  const filteredEntries = entries
    .filter(entry => {
      if (typeFilter !== 'all' && entry.waitlist_type !== typeFilter) return false;
      if (statusFilter !== 'all' && entry.status !== statusFilter) return false;
      if (notInDirectoryOnly && !isMissingFromDirectory(entry)) return false;
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

  const visibleEntries = selectedProperty
    ? filteredEntries.filter(e => e.property === selectedProperty)
    : filteredEntries;

  // Count by type
  const countByType = (type: ParkingWaitlistType) => 
    entries.filter(e => e.waitlist_type === type && e.status === 'Active').length;

  const activeCount = entries.filter(e => e.status === 'Active').length;
  const summaryCards: { label: string; value: number; type: string; icon: typeof Users; tone: string; iconBg: string }[] = [
    { label: 'Active on waitlist', value: activeCount, type: 'all', icon: Users, tone: 'text-blue-600', iconBg: 'bg-blue-50 dark:bg-blue-950' },
    { label: '1st Spot', value: countByType('1st Spot'), type: '1st Spot', icon: Car, tone: 'text-purple-600', iconBg: 'bg-purple-50 dark:bg-purple-950' },
    { label: 'Indoor Upgrade', value: countByType('Indoor Upgrade'), type: 'Indoor Upgrade', icon: Warehouse, tone: 'text-teal-600', iconBg: 'bg-teal-50 dark:bg-teal-950' },
    { label: '2nd Spot', value: countByType('2nd Spot'), type: '2nd Spot', icon: ParkingCircle, tone: 'text-indigo-600', iconBg: 'bg-indigo-50 dark:bg-indigo-950' },
  ];

  const tileProperties = [...new Set([...properties, ...entries.map(e => e.property)])]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  const daysWaiting = (createdAt: string) =>
    Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000));

  const hasFilters = searchTerm !== '' || typeFilter !== 'all' || statusFilter !== 'Active' || notInDirectoryOnly;

  const matchCounts = new Map(entries.filter(e => e.status === 'Active').map(e => [e.id, getEntryMatches(e).length]));

  const renderList = (list: ParkingWaitlist[], showProperty = false) => (
    <div className="overflow-x-auto rounded-xl border bg-white dark:bg-gray-900 shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40px]">
              <Checkbox
                checked={list.length > 0 && list.every(e => selectedIds.has(e.id))}
                onCheckedChange={toggleSelectAll}
              />
            </TableHead>
            <TableHead className="w-[40px]">#</TableHead>
            <TableHead>Resident</TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="hidden sm:table-cell">Status</TableHead>
            <TableHead className="hidden md:table-cell">Waiting</TableHead>
            <TableHead className="w-[170px] text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((entry, index) => {
            const expanded = expandedId === entry.id;
            return (
              <Fragment key={entry.id}>
                <TableRow
                  className={`cursor-pointer ${selectedIds.has(entry.id) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                  onClick={() => setExpandedId(expanded ? null : entry.id)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedIds.has(entry.id)}
                      onCheckedChange={() => toggleSelect(entry.id)}
                    />
                  </TableCell>
                  <TableCell className="font-medium text-muted-foreground">{index + 1}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5 font-medium">
                          {entry.tenant_name}
                          {matchCounts.get(entry.id) ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950 dark:text-green-300">
                              <Sparkles className="h-3 w-3" />
                              {matchCounts.get(entry.id)} {matchCounts.get(entry.id) === 1 ? 'match' : 'matches'}
                            </span>
                          ) : null}
                          {isMissingFromDirectory(entry) && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800" title="Name not found in the Directory; they may have moved out">
                              <AlertTriangle className="h-3 w-3" />
                              Not in Directory
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {showProperty && <span className="mr-1 rounded bg-muted px-1.5 py-0.5">{entry.property}</span>}
                          Unit {entry.unit_number}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={`${TYPE_COLORS[entry.waitlist_type]} text-white text-xs`}>{entry.waitlist_type}</Badge>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge className={`${STATUS_COLORS[entry.status]} text-white text-xs`}>{entry.status}</Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                    {daysWaiting(entry.created_at)} days
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      {onAssign && (entry.status === 'Active' || entry.status === 'Offered') && (
                        <Button size="sm" className="h-7" onClick={() => openAssign(entry)} title="Open a pre-filled change request">
                          <CheckCircle className="h-3.5 w-3.5 mr-1" />
                          Assign
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => openEditDialog(entry)} title="Edit">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(entry.id)} className="text-red-500 hover:text-red-700" title="Remove">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                {expanded && (
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableCell colSpan={7}>
                      <div className="grid grid-cols-2 gap-4 px-2 py-2 text-sm md:grid-cols-4">
                        <div>
                          <div className="text-xs text-muted-foreground">Contact</div>
                          <div>{entry.phone || 'No phone'}</div>
                          <div className="break-all">{entry.email || 'No email'}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Current spot</div>
                          <div>{entry.current_spot_number || 'None'}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Preferred type</div>
                          <div>{entry.preferred_spot_type || 'Any'}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Added</div>
                          <div>{formatDateLocal(entry.created_at)}</div>
                        </div>
                        <div className="col-span-2 md:col-span-4">
                          <div className="text-xs text-muted-foreground">Notes</div>
                          <div className="whitespace-pre-wrap break-words">{entry.notes || 'No notes'}</div>
                        </div>
                        <div className="col-span-2 md:col-span-4 rounded-lg border bg-white dark:bg-gray-900 p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <div className="text-sm font-medium">Matching spots</div>
                            <Button variant="outline" size="sm" className="h-7 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => handleDelete(entry.id)}>
                              <Trash2 className="h-3.5 w-3.5 mr-1" />
                              Remove from waitlist
                            </Button>
                          </div>
                          {entry.status !== 'Active' ? (
                            <div className="text-sm text-muted-foreground">Only Active entries are matched to spots.</div>
                          ) : (() => {
                            const matches = getEntryMatches(entry);
                            if (matches.length === 0) {
                              return <div className="text-sm text-muted-foreground">No open or upcoming spots match right now.</div>;
                            }
                            return (
                              <div className="divide-y">
                                {matches.slice(0, 6).map(({ spot, rank }) => (
                                  <div key={spot.full_space_code} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                                    <span className="font-medium">{spot.full_space_code}</span>
                                    {spot.spot_type && <span className="text-xs text-muted-foreground">{spot.spot_type}</span>}
                                    {spot.property !== entry.property && (
                                      <Badge variant="outline" className="text-xs bg-sky-50 text-sky-700 border-sky-200">Shared lot</Badge>
                                    )}
                                    <span className={`text-xs ${spot.status === 'Vacant' ? 'text-green-700' : 'text-orange-600'}`}>
                                      {spot.status === 'Vacant' ? 'Available now' : `Available ${spot.available_date ? formatDateLocal(spot.available_date) : 'soon'}`}
                                    </span>
                                    <span className={`text-xs ${rank === 1 ? 'font-medium text-green-700' : 'text-muted-foreground'}`}>
                                      {rank === 1 ? 'First in line' : `#${rank} in line`}
                                    </span>
                                    <Button size="sm" className="ml-auto h-7" onClick={() => openAssign(entry, spot)}>
                                      <CheckCircle className="h-3.5 w-3.5 mr-1" />
                                      Assign
                                    </Button>
                                  </div>
                                ))}
                                {matches.length > 6 && (
                                  <div className="pt-2 text-xs text-muted-foreground">+{matches.length - 6} more matching spots</div>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Summary cards (click to filter by type) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {summaryCards.map(card => {
          const Icon = card.icon;
          const active = typeFilter === card.type && card.type !== 'all';
          return (
            <button
              key={card.label}
              type="button"
              onClick={() => setTypeFilter(active ? 'all' : card.type)}
              className={`flex items-center gap-4 rounded-xl border bg-white dark:bg-gray-900 p-4 text-left shadow-sm transition hover:shadow-md ${active ? 'border-blue-600 ring-1 ring-blue-600' : ''}`}
            >
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${card.iconBg}`}>
                <Icon className={`h-5 w-5 ${card.tone}`} />
              </div>
              <div>
                <div className="text-2xl font-semibold tabular-nums leading-tight">{card.value}</div>
                <div className="text-sm text-muted-foreground">{card.label}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Header with Add button and Export */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Priority: 1st Spot, then Indoor Upgrade, then 2nd Spot. Oldest first within each type.
        </p>

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
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingEntry ? 'Edit Parking Waitlist Entry' : 'New Parking Waitlist Entry'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
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
                {/* Resident's current parking, from inventory */}
                {selectedTenantCode && selectedTenantSpots.length > 0 && (
                  <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md">
                    <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
                      <Car className="h-4 w-4" />
                      <span className="text-sm font-medium">
                        {formData.waitlist_type === 'Indoor Upgrade'
                          ? 'Select the spot to upgrade from:'
                          : `Current parking (${selectedTenantSpots.length} spot${selectedTenantSpots.length > 1 ? 's' : ''}):`}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selectedTenantSpots.map(sp => {
                        const label = `${sp.spot_type ? `${sp.spot_type}, ` : ''}${sp.future_tenant_code === selectedTenantCode && sp.tenant_code !== selectedTenantCode ? 'Future' : sp.status}`;
                        const selectable = formData.waitlist_type === 'Indoor Upgrade' && !isIndoorSpot(sp);
                        const picked = selectable && formData.current_spot_number === sp.full_space_code;
                        return selectable ? (
                          <button
                            key={sp.full_space_code}
                            type="button"
                            onClick={() => {
                              setFormData(prev => ({ ...prev, current_spot_number: sp.full_space_code }));
                              setFormErrors(prev => ({ ...prev, current_spot_number: '' }));
                            }}
                            className={`px-2 py-1 rounded border text-xs font-medium transition-all ${picked ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-gray-800 text-blue-700 dark:text-blue-300 border-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900'}`}
                          >
                            {sp.full_space_code}
                            <span className={`ml-1 text-[10px] ${picked ? 'text-blue-100' : 'text-muted-foreground'}`}>({label})</span>
                          </button>
                        ) : (
                          <Badge
                            key={sp.full_space_code}
                            variant="outline"
                            className="bg-white dark:bg-gray-800 text-blue-700 dark:text-blue-300 border-blue-300"
                          >
                            {sp.full_space_code}
                            <span className="ml-1 text-xs text-muted-foreground">({label})</span>
                          </Badge>
                        );
                      })}
                    </div>
                    {formErrors.current_spot_number && (
                      <p className="text-xs text-red-600 mt-2">{formErrors.current_spot_number}</p>
                    )}
                  </div>
                )}
                {selectedTenantCode && selectedTenantSpots.length === 0 && (
                  <div className="mt-2 p-3 bg-muted/40 border rounded-md text-sm text-muted-foreground">
                    No parking spot on file for this resident, so this is a 1st Spot request.
                  </div>
                )}
                {!selectedTenantCode && editingEntry?.current_spot_number && (
                  <p className="text-xs text-muted-foreground mt-2">Current spot on file: {editingEntry.current_spot_number}</p>
                )}
              </div>

              {/* Property & Unit - Auto-populated */}
              <div className="grid grid-cols-2 gap-4">
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
                  onValueChange={(value) => {
                    const type = value as ParkingWaitlistType;
                    const outdoor = selectedTenantSpots.find(sp => !isIndoorSpot(sp));
                    setFormData({
                      ...formData,
                      waitlist_type: type,
                      current_spot_number: type === 'Indoor Upgrade' && outdoor
                        ? outdoor.full_space_code
                        : formData.current_spot_number,
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WAITLIST_TYPES.map(type => {
                      const hasSpot = selectedTenantSpots.length > 0;
                      const disabled = !editingEntry && !!selectedTenantCode && (
                        (type.value === '1st Spot' && hasSpot) ||
                        (type.value !== '1st Spot' && !hasSpot) ||
                        (type.value === 'Indoor Upgrade' && !selectedTenantSpots.some(sp => !isIndoorSpot(sp)))
                      );
                      return (
                        <SelectItem key={type.value} value={type.value} disabled={disabled}>
                          <div className="flex flex-col">
                            <span>{type.label} (Priority {type.priority})</span>
                            <span className="text-xs text-muted-foreground">{TYPE_DESCRIPTIONS[type.value]}</span>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {formErrors.waitlist_type && (
                  <p className="text-red-500 text-xs mt-1">{formErrors.waitlist_type}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
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
              </div>

              {editingEntry && (
                <div>
                  <Label>Status</Label>
                  <div className="mt-1 grid grid-cols-4 gap-1 rounded-lg border bg-muted/40 p-1">
                    {STATUSES.map(status => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => setFormData({ ...formData, status })}
                        className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition ${formData.status === status ? 'bg-white text-foreground shadow-sm dark:bg-gray-900' : 'text-muted-foreground hover:text-foreground'}`}
                      >
                        <span className={`h-2 w-2 rounded-full ${STATUS_COLORS[status]}`} />
                        {status}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{STATUS_HELP[formData.status as ParkingWaitlistStatus]}</p>
                </div>
              )}

              {/* Notes */}
              <div>
                <Label>Notes <span className="text-xs text-muted-foreground">(optional)</span></Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Add any additional notes..."
                  className="h-16 text-sm resize-none"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-4">
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

      {/* Search + filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-white dark:bg-gray-900 p-3 shadow-sm">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, unit, or spot..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {WAITLIST_TYPES.map(type => (
              <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map(status => (
              <SelectItem key={status} value={status}>{status}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {missingCount > 0 && (
          <button
            type="button"
            onClick={() => setNotInDirectoryOnly(v => !v)}
            className={`rounded-full border px-3 py-1 text-sm transition ${notInDirectoryOnly ? 'border-amber-600 bg-amber-600 text-white' : 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'}`}
            title="Active entries whose name isn't in the Directory (moved out or name mismatch)"
          >
            <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
            Not in Directory ({missingCount})
          </button>
        )}
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => { setSearchTerm(''); setTypeFilter('all'); setStatusFilter('Active'); setNotInDirectoryOnly(false); }}>
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Property tiles: click to open, click again to close */}
      <div>
        <h3 className="mb-2 text-sm font-medium text-muted-foreground">Properties</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3">
          {tileProperties.map(property => {
            const list = filteredEntries.filter(e => e.property === property);
            const firstSpot = list.filter(e => e.waitlist_type === '1st Spot').length;
            const active = selectedProperty === property;
            return (
              <button
                key={property}
                type="button"
                onClick={() => { setSelectedProperty(active ? null : property); setExpandedId(null); }}
                className={`flex flex-col items-center rounded-xl border px-3 py-4 text-center shadow-sm transition-all ${active ? 'border-blue-600 bg-blue-600 text-white shadow-md' : 'bg-white dark:bg-gray-900 hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md'} border-t-4 ${active ? 'border-t-blue-600' : list.length > 0 ? 'border-t-blue-500' : 'border-t-gray-200 dark:border-t-gray-700'} ${list.length === 0 && !active ? 'opacity-60' : ''}`}
              >
                <span className={`max-w-full truncate text-sm font-medium ${active ? 'text-blue-50' : 'text-muted-foreground'}`} title={property}>
                  {property}
                </span>
                <span className={`mt-2 text-4xl font-bold tabular-nums leading-none ${active ? 'text-white' : list.length > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`}>
                  {list.length}
                </span>
                <span className={`mt-1 text-xs ${active ? 'text-blue-100' : 'text-muted-foreground'}`}>on waitlist</span>
                <span
                  className={`mt-3 inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium ${firstSpot > 0 ? (active ? 'bg-white/20 text-white' : 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300') : (active ? 'text-blue-100' : 'text-muted-foreground')}`}
                >
                  {firstSpot > 0 ? `${firstSpot} need a 1st spot` : 'No 1st spot requests'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected property (or search results across properties) */}
      {selectedProperty ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">
              {selectedProperty}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {visibleEntries.length} {visibleEntries.length === 1 ? 'entry' : 'entries'} · in priority order
              </span>
            </h3>
            <Button variant="ghost" size="sm" onClick={() => setSelectedProperty(null)}>
              <X className="h-4 w-4 mr-1" />
              Close
            </Button>
          </div>
          {visibleEntries.length === 0 ? (
            <div className="rounded-xl border border-dashed py-10 text-center text-muted-foreground">
              No entries at {selectedProperty} match these filters
            </div>
          ) : renderList(visibleEntries)}
        </div>
      ) : searchTerm ? (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">
            Search results
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {filteredEntries.length} across all properties
            </span>
          </h3>
          {filteredEntries.length === 0 ? (
            <div className="rounded-xl border border-dashed py-10 text-center text-muted-foreground">
              No one matches &ldquo;{searchTerm}&rdquo;
            </div>
          ) : renderList(filteredEntries, true)}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
          Select a property above to see its parking waitlist, or search by name.
        </div>
      )}

    </div>
  );
}
