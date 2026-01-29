'use client';

import { useState, useEffect, useRef } from 'react';
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
import { Plus, Eye, Zap, Accessibility, Search, X, User, Car } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { PROPERTY_UNITS } from '@/lib/property-units';

interface ParkingSpot {
  id: string;
  property: string;
  spot_number: string;
  full_space_code: string;
  status?: 'Occupied' | 'Vacant' | 'Notice' | 'Reserved' | 'Future';
  tenant_code?: string | null;
  monthly_rent?: number;
  spot_type?: string;
  termination_date?: string | null;
  available_date?: string | null;
  has_ev_charging?: boolean;
  is_handicap?: boolean;
}

interface ParkingChangeFormProps {
  onSubmitSuccess: () => void;
  submitterName: string;
  properties: string[];
  spots: ParkingSpot[];
}

type ChangeType = 'Termination' | 'Add' | 'Transfer' | 'New Lease Signed';

const CHANGE_TYPES: { value: ChangeType; label: string; description: string }[] = [
  { value: 'Termination', label: 'Termination', description: 'Tenant ending their parking spot' },
  { value: 'Add', label: 'Add', description: 'Existing tenant adding a parking spot' },
  { value: 'Transfer', label: 'Transfer', description: 'Move tenant from one spot to another' },
  { value: 'New Lease Signed', label: 'New Lease Signed', description: 'New tenant getting parking with lease' },
];

export function ParkingChangeForm({ onSubmitSuccess, submitterName, properties, spots }: ParkingChangeFormProps) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showInventoryPreview, setShowInventoryPreview] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Form state
  const [changeType, setChangeType] = useState<ChangeType | ''>('');
  const [tenantName, setTenantName] = useState('');
  const [tenantCode, setTenantCode] = useState('');
  const [selectedProperty, setSelectedProperty] = useState('');
  const [tenantUnit, setTenantUnit] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [primarySpace, setPrimarySpace] = useState('');
  const [transferToSpace, setTransferToSpace] = useState('');
  const [otherNotes, setOtherNotes] = useState('');

  // Directory state for tenant autocomplete
  const [directory, setDirectory] = useState<{ tenantCode: string; residentName: string; unitNumber?: string; property?: string }[]>([]);
  const [tenantSearch, setTenantSearch] = useState('');
  const [showTenantDropdown, setShowTenantDropdown] = useState(false);
  const [isLoadingDirectory, setIsLoadingDirectory] = useState(false);
  const tenantInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch directory when form opens
  useEffect(() => {
    if (open && directory.length === 0) {
      setIsLoadingDirectory(true);
      fetch('/api/directory')
        .then(res => res.json())
        .then(data => {
          setDirectory(data.directory || []);
        })
        .catch(err => console.error('Failed to load directory:', err))
        .finally(() => setIsLoadingDirectory(false));
    }
  }, [open, directory.length]);

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
  }).slice(0, 20); // Limit to 20 results

  // Handle tenant selection from directory - auto-populate property and unit
  const handleTenantSelect = (entry: { tenantCode: string; residentName: string; unitNumber?: string; property?: string }) => {
    setTenantName(entry.residentName);
    setTenantCode(entry.tenantCode);
    setTenantSearch(entry.residentName);
    setShowTenantDropdown(false);
    setValidationErrors(prev => ({ ...prev, tenantName: '' }));
    
    // Auto-populate property if available
    if (entry.property) {
      // Map directory property names to parking property names
      const propertyNameMap: Record<string, string> = {
        'Broadway': 'Broadway',
        'Granville': 'Granville',
        'Pratt': 'Pratt',
        'West Montrose': 'West Montrose',
        'Glenlake': 'Glenlake',
        'North Clark': 'North Clark',
        'N. Clark': 'North Clark',
        '246 Green Bay': 'Green Bay 246',
        '440 Green Bay': 'Green Bay 440',
        '546 Green Bay': 'Green Bay 546',
      };
      const mappedProperty = propertyNameMap[entry.property] || entry.property;
      if (properties.includes(mappedProperty)) {
        setSelectedProperty(mappedProperty);
        setValidationErrors(prev => ({ ...prev, property: '' }));
      }
    }
    
    // Auto-populate unit if available
    if (entry.unitNumber) {
      setTenantUnit(entry.unitNumber);
      setValidationErrors(prev => ({ ...prev, tenantUnit: '' }));
    }
  };

  // Clear tenant selection and reset auto-populated fields
  const clearTenantSelection = () => {
    setTenantName('');
    setTenantCode('');
    setTenantSearch('');
    setSelectedProperty('');
    setTenantUnit('');
    setPrimarySpace('');
    setTransferToSpace('');
    tenantInputRef.current?.focus();
  };

  // Find existing parking spots for the selected tenant
  const tenantExistingSpots = tenantCode 
    ? spots.filter(spot => spot.tenant_code === tenantCode)
    : [];

  // Map parking property names to PROPERTY_UNITS keys (handle naming differences)
  const propertyToUnitsKey: Record<string, string> = {
    'North Clark': 'N. Clark',
    'Green Bay 246': '246 Green Bay',
    'Green Bay 440': '440 Green Bay',
    'Green Bay 546': '546 Green Bay',
  };
  
  // Get the correct key for PROPERTY_UNITS
  const unitsKey = propertyToUnitsKey[selectedProperty] || selectedProperty;
  
  // Get apartment units for selected property
  const availableUnits = unitsKey && PROPERTY_UNITS[unitsKey] 
    ? PROPERTY_UNITS[unitsKey].sort((a, b) => {
        // Sort numerically where possible, fallback to string compare
        const numA = parseInt(a.replace(/\D/g, '')) || 0;
        const numB = parseInt(b.replace(/\D/g, '')) || 0;
        if (numA !== numB) return numA - numB;
        return a.localeCompare(b);
      })
    : [];

  // Check if a spot is available by the effective date
  const isSpotAvailableByDate = (spot: ParkingSpot) => {
    // If no effective date selected, show all eligible spots
    if (!effectiveDate) return true;
    
    // Vacant spots are immediately available
    if (spot.status === 'Vacant') return true;
    
    // Notice spots: check if available_date is on or before effective date
    if (spot.status === 'Notice' && spot.available_date) {
      return spot.available_date <= effectiveDate;
    }
    
    return false;
  };

  // Get parking spots for selected property, filtered by change type rules:
  // - Termination: Show occupied spots (spots with tenants)
  // - Add/New Lease: Show Vacant + Notice spots available by effective date
  // - Transfer: Primary space shows occupied spots (current spot)
  const getPrimarySpots = () => {
    return spots
      .filter(spot => {
        if (spot.property !== selectedProperty) return false;
        
        if (changeType === 'Termination') {
          // Termination: Show spots that have tenants (Occupied, Notice, Future)
          return spot.status === 'Occupied' || spot.status === 'Notice' || spot.status === 'Future';
        } else if (changeType === 'Add' || changeType === 'New Lease Signed') {
          // Add/New Lease: Show Vacant + Notice spots that are available by effective date
          if (spot.status !== 'Vacant' && spot.status !== 'Notice') return false;
          return isSpotAvailableByDate(spot);
        } else if (changeType === 'Transfer') {
          // Transfer: Primary space is the current occupied spot
          return spot.status === 'Occupied' || spot.status === 'Notice' || spot.status === 'Future';
        }
        return true; // Default: show all
      })
      .map(spot => {
        const spotNum = spot.spot_number || spot.full_space_code.split(' - ').pop() || '';
        return {
          value: spot.full_space_code,
          label: spot.full_space_code,
          spotNumber: parseInt(spotNum.replace(/\D/g, '')) || 0,
          status: spot.status,
          tenant: spot.tenant_code,
          availableDate: spot.available_date,
          terminationDate: spot.termination_date,
        };
      })
      .sort((a, b) => a.spotNumber - b.spotNumber);
  };

  // For Transfer: Get Vacant + Notice spots for "Transfer To" dropdown (filtered by effective date)
  const getTransferToSpots = () => {
    return spots
      .filter(spot => {
        if (spot.property !== selectedProperty) return false;
        // Show Vacant and Notice spots that are available by effective date
        if (spot.status !== 'Vacant' && spot.status !== 'Notice') return false;
        return isSpotAvailableByDate(spot);
      })
      .map(spot => {
        const spotNum = spot.spot_number || spot.full_space_code.split(' - ').pop() || '';
        return {
          value: spot.full_space_code,
          label: spot.full_space_code,
          spotNumber: parseInt(spotNum.replace(/\D/g, '')) || 0,
          status: spot.status,
          availableDate: spot.available_date,
          terminationDate: spot.termination_date,
        };
      })
      .sort((a, b) => a.spotNumber - b.spotNumber);
  };

  const availableParkingSpots = getPrimarySpots();
  const availableTransferSpots = getTransferToSpots();

  // Get the selected spot's details (for date validation)
  const getSelectedSpotDetails = (spaceCode: string) => {
    return spots.find(s => s.full_space_code === spaceCode);
  };

  // Get minimum effective date based on selected spot
  const getMinEffectiveDate = (spaceCode: string) => {
    const spot = getSelectedSpotDetails(spaceCode);
    if (!spot) return new Date().toISOString().split('T')[0];
    
    // For Notice spots, minimum date is the day after termination
    if (spot.status === 'Notice' && spot.available_date) {
      return spot.available_date;
    }
    
    // For Vacant spots, today is fine
    return new Date().toISOString().split('T')[0];
  };

  // Auto-set effective date when selecting a spot for Add/New Lease/Transfer
  const handleSpotSelection = (spaceCode: string, isTransferTo: boolean = false) => {
    if (isTransferTo) {
      setTransferToSpace(spaceCode);
      setValidationErrors(prev => ({ ...prev, transferToSpace: '' }));
    } else {
      setPrimarySpace(spaceCode);
      setValidationErrors(prev => ({ ...prev, primarySpace: '' }));
    }

    // Auto-set effective date for Add/New Lease/Transfer operations
    if (changeType === 'Add' || changeType === 'New Lease Signed' || (changeType === 'Transfer' && isTransferTo)) {
      const minDate = getMinEffectiveDate(spaceCode);
      // Only auto-set if current effective date is empty or before the minimum
      if (!effectiveDate || effectiveDate < minDate) {
        setEffectiveDate(minDate);
        setValidationErrors(prev => ({ ...prev, effectiveDate: '' }));
      }
    }
  };

  const resetForm = () => {
    setChangeType('');
    setTenantName('');
    setTenantCode('');
    setTenantSearch('');
    setSelectedProperty('');
    setTenantUnit('');
    setEffectiveDate('');
    setPrimarySpace('');
    setTransferToSpace('');
    setOtherNotes('');
    setValidationErrors({});
    setShowTenantDropdown(false);
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    
    if (!changeType) errors.changeType = 'Type is required';
    if (!tenantName.trim()) errors.tenantName = 'Tenant Name is required';
    if (!selectedProperty) errors.property = 'Property is required';
    if (!tenantUnit) errors.tenantUnit = 'Tenant Unit is required';
    if (!effectiveDate) errors.effectiveDate = 'Effective Date is required';
    if (!primarySpace) errors.primarySpace = 'Primary Space is required';
    
    // Transfer To Space is required only for Transfer type
    if (changeType === 'Transfer' && !transferToSpace.trim()) {
      errors.transferToSpace = 'Transfer To Space is required for transfers';
    }

    // Date validation for Notice spots - effective date must be on or after available date
    if (effectiveDate && primarySpace) {
      const spotToCheck = changeType === 'Transfer' ? transferToSpace : primarySpace;
      if (spotToCheck && (changeType === 'Add' || changeType === 'New Lease Signed' || changeType === 'Transfer')) {
        const minDate = getMinEffectiveDate(spotToCheck);
        if (effectiveDate < minDate) {
          const spot = getSelectedSpotDetails(spotToCheck);
          if (spot?.status === 'Notice') {
            errors.effectiveDate = `Date must be on or after ${new Date(minDate).toLocaleDateString()} (spot available after current tenant leaves)`;
          }
        }
      }
    }

    return errors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const errors = validateForm();
    setValidationErrors(errors);
    
    if (Object.keys(errors).length > 0) {
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/parking/change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: changeType,
          tenantName,
          tenantCode,
          tenantUnit,
          property: selectedProperty,
          effectiveDate,
          primarySpace,
          transferToSpace: changeType === 'Transfer' ? transferToSpace : '',
          submitter: submitterName,
          otherNotes,
          date: new Date().toLocaleDateString('en-US'),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to submit change');
      }

      alert('Parking change submitted successfully!');
      resetForm();
      setOpen(false);
      onSubmitSuccess();
    } catch (error) {
      console.error('Error submitting parking change:', error);
      alert('Failed to submit parking change. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (!isOpen) resetForm();
    }}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Change Request
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Parking Change Request</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Change Type */}
          <div>
            <Label>Change Type *</Label>
            <Select
              value={changeType}
              onValueChange={(value) => {
                setChangeType(value as ChangeType);
                setPrimarySpace(''); // Reset primary space when change type changes (different spot filters)
                setTransferToSpace(''); // Reset transfer space
                setValidationErrors(prev => ({ ...prev, changeType: '' }));
              }}
            >
              <SelectTrigger className={validationErrors.changeType ? 'border-red-500' : ''}>
                <SelectValue placeholder="Select change type..." />
              </SelectTrigger>
              <SelectContent>
                {CHANGE_TYPES.map(type => (
                  <SelectItem key={type.value} value={type.value}>
                    <div className="flex flex-col">
                      <span>{type.label}</span>
                      <span className="text-xs text-muted-foreground">{type.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {validationErrors.changeType && (
              <p className="text-sm text-red-500 mt-1">{validationErrors.changeType}</p>
            )}
          </div>

          {/* Tenant Name - Autocomplete from Directory */}
          <div className="relative">
            <Label htmlFor="tenantSearch">Tenant Name *</Label>
            <div className="relative">
              {tenantName ? (
                // Selected tenant display
                <div className={`flex items-center justify-between px-3 py-2 border rounded-md bg-muted/30 ${validationErrors.tenantName ? 'border-red-500' : ''}`}>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{tenantName}</span>
                    <Badge variant="outline" className="text-xs">{tenantCode}</Badge>
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
              ) : (
                // Search input
                <>
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    ref={tenantInputRef}
                    id="tenantSearch"
                    value={tenantSearch}
                    onChange={(e) => {
                      setTenantSearch(e.target.value);
                      setShowTenantDropdown(true);
                      setValidationErrors(prev => ({ ...prev, tenantName: '' }));
                    }}
                    onFocus={() => setShowTenantDropdown(true)}
                    placeholder={isLoadingDirectory ? "Loading directory..." : "Search resident name or code..."}
                    className={`pl-10 ${validationErrors.tenantName ? 'border-red-500' : ''}`}
                    disabled={isLoadingDirectory}
                  />
                </>
              )}
              
              {/* Dropdown results */}
              {showTenantDropdown && !tenantName && tenantSearch.length > 0 && (
                <div 
                  ref={dropdownRef}
                  className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-[200px] overflow-y-auto"
                >
                  {filteredDirectory.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      No residents found matching "{tenantSearch}"
                    </div>
                  ) : (
                    filteredDirectory.map((entry, idx) => (
                      <button
                        key={`${entry.tenantCode}-${idx}`}
                        type="button"
                        className="w-full px-3 py-2 text-left hover:bg-muted flex items-center justify-between text-sm"
                        onClick={() => handleTenantSelect(entry)}
                      >
                        <span>{entry.residentName}</span>
                        <Badge variant="outline" className="text-xs ml-2">{entry.tenantCode}</Badge>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            {validationErrors.tenantName && (
              <p className="text-sm text-red-500 mt-1">{validationErrors.tenantName}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Start typing to search the resident directory
            </p>
            
            {/* Existing Parking Spot Indicator */}
            {tenantCode && tenantExistingSpots.length > 0 && (
              <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md">
                <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
                  <Car className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    This tenant has {tenantExistingSpots.length} existing parking spot{tenantExistingSpots.length > 1 ? 's' : ''}:
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {tenantExistingSpots.map(spot => (
                    <Badge 
                      key={spot.id} 
                      variant="outline" 
                      className="bg-white dark:bg-gray-800 text-blue-700 dark:text-blue-300 border-blue-300"
                    >
                      {spot.full_space_code}
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({spot.status})
                      </span>
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Property - Auto-populated from tenant selection */}
            <div>
              <Label>Property *</Label>
              <Input
                value={selectedProperty || ''}
                disabled
                placeholder="Auto-filled from tenant"
                className={`bg-muted/50 ${validationErrors.property ? 'border-red-500' : ''}`}
              />
              {validationErrors.property && (
                <p className="text-sm text-red-500 mt-1">{validationErrors.property}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">Auto-filled from tenant selection</p>
            </div>

            {/* Tenant Unit - Auto-populated from tenant selection */}
            <div>
              <Label>Tenant Unit *</Label>
              <Input
                value={tenantUnit || ''}
                disabled
                placeholder="Auto-filled from tenant"
                className={`bg-muted/50 ${validationErrors.tenantUnit ? 'border-red-500' : ''}`}
              />
              {validationErrors.tenantUnit && (
                <p className="text-sm text-red-500 mt-1">{validationErrors.tenantUnit}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">Auto-filled from tenant selection</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Effective Date */}
            <div>
              <Label htmlFor="effectiveDate">Effective Date *</Label>
              <Input
                id="effectiveDate"
                type="date"
                value={effectiveDate}
                onChange={(e) => {
                  setEffectiveDate(e.target.value);
                  // Reset space selections when date changes (available spots may change)
                  if (changeType === 'Add' || changeType === 'New Lease Signed' || changeType === 'Transfer') {
                    setPrimarySpace('');
                    setTransferToSpace('');
                  }
                  setValidationErrors(prev => ({ ...prev, effectiveDate: '' }));
                }}
                className={validationErrors.effectiveDate ? 'border-red-500' : ''}
              />
              {validationErrors.effectiveDate && (
                <p className="text-sm text-red-500 mt-1">{validationErrors.effectiveDate}</p>
              )}
              {(changeType === 'Add' || changeType === 'New Lease Signed') && (
                <p className="text-xs text-muted-foreground mt-1">
                  Available spots will filter based on this date
                </p>
              )}
            </div>

            {/* Primary Space - filtered by property and change type */}
            <div>
              <div className="flex items-center justify-between">
                <Label>
                  Primary Space *
                  {changeType && (
                    <span className="text-xs text-muted-foreground ml-1">
                      ({changeType === 'Add' || changeType === 'New Lease Signed' ? 'Available spots' : 'Occupied spots'})
                    </span>
                  )}
                </Label>
                {selectedProperty && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setShowInventoryPreview(true)}
                  >
                    <Eye className="h-3 w-3 mr-1" />
                    Preview Inventory
                  </Button>
                )}
              </div>
              <Select
                value={primarySpace}
                onValueChange={(value) => handleSpotSelection(value, false)}
                disabled={!changeType || !tenantName || !effectiveDate || !selectedProperty}
              >
                <SelectTrigger className={validationErrors.primarySpace ? 'border-red-500' : ''}>
                  <SelectValue placeholder={
                    !changeType ? "Select change type first" :
                    !tenantName ? "Select tenant first" :
                    !effectiveDate ? "Select effective date first" :
                    !selectedProperty ? "Select property first" : 
                    changeType === 'Add' || changeType === 'New Lease Signed' ? "Select available space..." :
                    "Select occupied space..."
                  } />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {availableParkingSpots.map(spot => (
                    <SelectItem key={spot.value} value={spot.label}>
                      <div className="flex items-center gap-2">
                        <span>{spot.label}</span>
                        {(changeType === 'Add' || changeType === 'New Lease Signed') && spot.status === 'Notice' && (
                          <Badge variant="outline" className="text-xs bg-orange-50 text-orange-600 border-orange-200">
                            Available {spot.availableDate ? new Date(spot.availableDate).toLocaleDateString() : ''}
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {validationErrors.primarySpace && (
                <p className="text-sm text-red-500 mt-1">{validationErrors.primarySpace}</p>
              )}
            </div>
          </div>

          {/* Inventory Preview Dialog */}
          <Dialog open={showInventoryPreview} onOpenChange={setShowInventoryPreview}>
            <DialogContent className="w-[90vw] max-w-[90vw] max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Parking Inventory - {selectedProperty}</DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                <div className="flex gap-2 text-xs mb-3">
                  <Badge className="bg-green-500 text-white">Vacant</Badge>
                  <Badge className="bg-red-500 text-white">Occupied</Badge>
                  <Badge className="bg-orange-400 text-white">Notice</Badge>
                  <Badge className="bg-sky-400 text-white">Reserved</Badge>
                  <Badge className="bg-gray-800 text-white">Future</Badge>
                </div>
                <div className="border rounded-md overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="px-3 py-2 text-left">Space</th>
                        <th className="px-3 py-2 text-left">Type</th>
                        <th className="px-3 py-2 text-left">Status</th>
                        <th className="px-3 py-2 text-left">End Date</th>
                        <th className="px-3 py-2 text-left">Rent</th>
                        <th className="px-3 py-2 text-left">Features</th>
                        <th className="px-3 py-2 text-left">Tenant</th>
                      </tr>
                    </thead>
                    <tbody>
                      {spots
                        .filter(spot => spot.property === selectedProperty)
                        .sort((a, b) => {
                          const numA = parseInt((a.spot_number || '').replace(/\D/g, '')) || 0;
                          const numB = parseInt((b.spot_number || '').replace(/\D/g, '')) || 0;
                          return numA - numB;
                        })
                        .map(spot => {
                          const statusColor = 
                            spot.status === 'Vacant' ? 'bg-green-500' :
                            spot.status === 'Notice' ? 'bg-orange-400' :
                            spot.status === 'Reserved' ? 'bg-sky-400' :
                            spot.status === 'Future' ? 'bg-gray-800' :
                            'bg-red-500'; // Occupied
                          
                          const rowBg = 
                            spot.status === 'Vacant' ? 'bg-green-50' :
                            spot.status === 'Notice' ? 'bg-orange-50' :
                            spot.status === 'Future' ? 'bg-gray-100' :
                            '';
                          
                          return (
                            <tr 
                              key={spot.id} 
                              className={`border-t ${rowBg}`}
                            >
                              <td className="px-3 py-2 font-medium">{spot.full_space_code}</td>
                              <td className="px-3 py-2">{spot.spot_type || '-'}</td>
                              <td className="px-3 py-2">
                                <Badge className={`${statusColor} text-white`}>
                                  {spot.status || 'Occupied'}
                                </Badge>
                              </td>
                              <td className="px-3 py-2">
                                {spot.status === 'Notice' && spot.available_date ? (
                                  <div className="flex flex-col">
                                    <span className="text-orange-600 font-medium">
                                      Avail: {new Date(spot.available_date).toLocaleDateString()}
                                    </span>
                                    {spot.termination_date && (
                                      <span className="text-xs text-muted-foreground">
                                        End: {new Date(spot.termination_date).toLocaleDateString()}
                                      </span>
                                    )}
                                  </div>
                                ) : (spot.status === 'Notice' || spot.status === 'Future') && spot.termination_date ? (
                                  new Date(spot.termination_date).toLocaleDateString()
                                ) : '-'}
                              </td>
                              <td className="px-3 py-2">${spot.monthly_rent || 0}</td>
                              <td className="px-3 py-2">
                                <div className="flex gap-1">
                                  {spot.has_ev_charging && (
                                    <span title="EV Charging"><Zap className="h-4 w-4 text-yellow-500" /></span>
                                  )}
                                  {spot.is_handicap && (
                                    <span title="Handicap"><Accessibility className="h-4 w-4 text-blue-500" /></span>
                                  )}
                                  {!spot.has_ev_charging && !spot.is_handicap && (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-2 text-muted-foreground">
                                {spot.tenant_code || '-'}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
                <div className="flex gap-4 text-xs text-muted-foreground pt-2">
                  <span className="text-green-600 font-medium">
                    {spots.filter(s => s.property === selectedProperty && s.status === 'Vacant').length} vacant
                  </span>
                  <span className="text-orange-500 font-medium">
                    {spots.filter(s => s.property === selectedProperty && s.status === 'Notice').length} on notice
                  </span>
                  <span className="text-gray-700 font-medium">
                    {spots.filter(s => s.property === selectedProperty && s.status === 'Future').length} future
                  </span>
                  <span>
                    {spots.filter(s => s.property === selectedProperty).length} total spots
                  </span>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Transfer To Space - only shown for Transfer type, Vacant + Notice spots */}
          {changeType === 'Transfer' && (
            <div>
              <Label>Transfer To Space * <span className="text-xs text-muted-foreground">(Available spots)</span></Label>
              <Select
                value={transferToSpace}
                onValueChange={(value) => handleSpotSelection(value, true)}
                disabled={!selectedProperty}
              >
                <SelectTrigger className={validationErrors.transferToSpace ? 'border-red-500' : ''}>
                  <SelectValue placeholder={selectedProperty ? "Select available space..." : "Select property first"} />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {availableTransferSpots.map(spot => (
                    <SelectItem key={spot.value} value={spot.label}>
                      <div className="flex items-center gap-2">
                        <span>{spot.label}</span>
                        {spot.status === 'Notice' && (
                          <Badge variant="outline" className="text-xs bg-orange-50 text-orange-600 border-orange-200">
                            Available {spot.availableDate ? new Date(spot.availableDate).toLocaleDateString() : ''}
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {validationErrors.transferToSpace && (
                <p className="text-sm text-red-500 mt-1">{validationErrors.transferToSpace}</p>
              )}
            </div>
          )}

          {/* Other Notes */}
          <div>
            <Label htmlFor="otherNotes">Other Notes <span className="text-xs text-muted-foreground">(optional)</span></Label>
            <textarea
              id="otherNotes"
              value={otherNotes}
              onChange={(e) => setOtherNotes(e.target.value)}
              className="w-full min-h-[80px] px-3 py-2 border rounded-md text-sm"
              placeholder="Any additional notes..."
            />
          </div>

          {/* Submitter (auto-filled, read-only) */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Submitter</Label>
              <Input
                value={submitterName}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground mt-1">Auto-filled from your account</p>
            </div>
            <div>
              <Label>Submission Date</Label>
              <Input
                value={new Date().toLocaleDateString('en-US')}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground mt-1">Auto-filled to today</p>
            </div>
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Submitting...' : 'Submit Change'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
