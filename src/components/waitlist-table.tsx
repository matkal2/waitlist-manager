'use client';

import { useState, useEffect } from 'react';
import { WaitlistEntry } from '@/types/database';
import { Badge } from '@/components/ui/badge';
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
} from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import { ArrowUpDown, Search, UserCircle, Trash2, ChevronDown, ChevronUp, Pencil, FileText, Phone } from 'lucide-react';
import { PROPERTY_UNITS } from '@/lib/property-units';
import { getPropertyNicknames } from '@/lib/properties';

// Map user emails to agent names
const EMAIL_TO_AGENT: Record<string, string> = {
  'mkaleb@hpvgproperties.com': 'Matthew Kaleb',
  'mdillon@hpvgproperties.com': 'Michael Dillon',
  'matthew.kaleb1763@gmail.com': 'Matthew Kaleb', // Test email
};

interface WaitlistTableProps {
  entries: WaitlistEntry[];
  onRefresh: () => void;
  currentUserEmail?: string;
}

type SortField = 'created_at' | 'full_name' | 'entry_type' | 'max_budget' | 'move_in_date';
type SortOrder = 'asc' | 'desc';

const PROPERTIES = getPropertyNicknames();

const AGENTS = ['Matthew Kaleb', 'Michael Dillon', 'Unassigned'];

// Normalize property names for filtering (handles legacy "N. Clark" vs "North Clark" etc.)
const normalizePropertyName = (name: string): string => {
  const mapping: Record<string, string> = {
    'N. Clark': 'North Clark',
    'N Clark': 'North Clark',
    '246 Green Bay': 'Green Bay 246',
    '440 Green Bay': 'Green Bay 440',
    '546 Green Bay': 'Green Bay 546',
  };
  return mapping[name] || name;
};

// Format date without timezone shift (parses YYYY-MM-DD as local date)
const formatDateLocal = (dateString: string) => {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString();
};

export function WaitlistTable({ entries, onRefresh, currentUserEmail }: WaitlistTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [agentFilter, setAgentFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [propertyFilter, setPropertyFilter] = useState<string>('');
  const [section8Filter, setSection8Filter] = useState<string>('');
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [editingEntry, setEditingEntry] = useState<WaitlistEntry | null>(null);
  const [editForm, setEditForm] = useState<Partial<WaitlistEntry>>({});
  // Check localStorage for saved filter state on initial load
  const [filtersComplete, setFiltersComplete] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('waitlist_filters_complete') === 'true';
    }
    return false;
  });
  const [filterStep, setFilterStep] = useState(1);
  const [filtersInitialized, setFiltersInitialized] = useState(false);

  // Load saved filters from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedAgent = localStorage.getItem('waitlist_agent_filter');
      const savedProperty = localStorage.getItem('waitlist_property_filter');
      const savedSection8 = localStorage.getItem('waitlist_section8_filter');
      const savedComplete = localStorage.getItem('waitlist_filters_complete') === 'true';
      
      if (savedAgent) setAgentFilter(savedAgent);
      if (savedProperty) setPropertyFilter(savedProperty);
      if (savedSection8) setSection8Filter(savedSection8);
      if (savedComplete) setFiltersComplete(true);
      setFiltersInitialized(true);
    }
  }, []);

  // Save filters to localStorage whenever they change
  useEffect(() => {
    if (filtersInitialized && typeof window !== 'undefined') {
      localStorage.setItem('waitlist_agent_filter', agentFilter);
      localStorage.setItem('waitlist_property_filter', propertyFilter);
      localStorage.setItem('waitlist_section8_filter', section8Filter);
      localStorage.setItem('waitlist_filters_complete', filtersComplete.toString());
    }
  }, [agentFilter, propertyFilter, section8Filter, filtersComplete, filtersInitialized]);

  // Get current user's agent name from email
  const currentAgent = currentUserEmail ? EMAIL_TO_AGENT[currentUserEmail] : null;

  // Helper to check if an entry is unassigned
  const isUnassigned = (agent: string | null | undefined) => {
    return !agent || agent === '' || agent === 'Unassigned';
  };

  // Check if user can edit/delete an entry
  // Unassigned entries can be modified by anyone (to allow self-assignment)
  // Assigned entries can only be modified by the assigned agent
  const canModifyEntry = (entry: WaitlistEntry) => {
    if (!currentAgent) return true; // If no agent mapping, allow all (fallback)
    if (isUnassigned(entry.assigned_agent)) return true; // Unassigned entries can be modified by anyone
    return entry.assigned_agent === currentAgent;
  };

  // Check if user can change the agent assignment
  // Only the assigned agent can change assignment, or anyone can assign unassigned entries
  const canChangeAgent = (entry: WaitlistEntry) => {
    if (!currentAgent) return true; // If no agent mapping, allow all (fallback)
    if (isUnassigned(entry.assigned_agent)) return true; // Anyone can assign unassigned entries
    return entry.assigned_agent === currentAgent; // Only assigned agent can reassign
  };

  const toggleRowExpanded = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  const handleEditClick = (entry: WaitlistEntry) => {
    setEditingEntry(entry);
    setEditForm({
      full_name: entry.full_name,
      email: entry.email,
      phone: entry.phone,
      property: entry.property,
      unit_type_pref: entry.unit_type_pref,
      preferred_units: entry.preferred_units,
      floor_pref: entry.floor_pref,
      max_budget: entry.max_budget,
      move_in_date: entry.move_in_date,
      move_in_date_end: entry.move_in_date_end,
      internal_notes: entry.internal_notes,
      assigned_agent: entry.assigned_agent,
      status: entry.status,
      entry_type: entry.entry_type,
      current_unit_number: entry.current_unit_number,
      is_section_8: entry.is_section_8,
      extended_retention: entry.extended_retention,
    });
  };

  const handleEditSave = async () => {
    if (!editingEntry) return;

    // Calculate what changed
    const changes: Record<string, { old: unknown; new: unknown }> = {};
    Object.keys(editForm).forEach(key => {
      const oldVal = editingEntry[key as keyof typeof editingEntry];
      const newVal = editForm[key as keyof typeof editForm];
      if (oldVal !== newVal) {
        changes[key] = { old: oldVal, new: newVal };
      }
    });

    // Log the edit before making changes
    await supabase.from('activity_log').insert({
      action_type: 'edit',
      entry_id: editingEntry.id,
      entry_data: editingEntry,
      changed_by: currentUserEmail || null,
      changes: changes,
    });

    const { error } = await supabase
      .from('waitlist_entries')
      .update(editForm)
      .eq('id', editingEntry.id);

    if (error) {
      console.error('Error updating entry:', error);
      alert('Failed to update entry');
    } else {
      setEditingEntry(null);
      onRefresh();
    }
  };

  const uniqueAgents = [...new Set(entries.map(e => e.assigned_agent).filter(Boolean))] as string[];

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    console.log('Status change requested:', { id, newStatus });
    
    // Find the current entry to get old status
    const currentEntry = entries.find(e => e.id === id);
    const oldStatus = currentEntry?.status || 'Unknown';
    
    try {
      const { data, error } = await supabase
        .from('waitlist_entries')
        .update({ status: newStatus })
        .eq('id', id)
        .select();

      if (error) {
        console.error('Error updating status:', error);
        alert(`Failed to update status: ${error.message}`);
      } else {
        console.log('Status updated successfully:', data);
        
        // Log the status change to activity_log
        await supabase.from('activity_log').insert({
          action_type: 'update',
          entry_id: id,
          entry_data: currentEntry,
          changed_by: currentUserEmail || null,
          changes: { field: 'status', old_value: oldStatus, new_value: newStatus },
        });
        
        onRefresh();
      }
    } catch (err) {
      console.error('Exception updating status:', err);
      alert('Failed to update status');
    }
  };

  const handleDelete = async (id: string, name: string, entry: WaitlistEntry) => {
    if (!canModifyEntry(entry)) {
      alert('You can only delete entries assigned to you.');
      return;
    }

    if (!confirm(`Are you sure you want to delete ${name} from the waitlist?`)) {
      return;
    }

    // Log the deletion before deleting
    await supabase.from('activity_log').insert({
      action_type: 'delete',
      entry_id: id,
      entry_data: entry,
      changed_by: currentUserEmail || null,
      changes: null,
    });

    const { error } = await supabase
      .from('waitlist_entries')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting entry:', error);
      alert('Failed to delete entry');
    } else {
      onRefresh();
    }
  };

  const handleMarkContacted = async (id: string, entry: WaitlistEntry) => {
    const now = new Date().toISOString();
    
    try {
      // Log the contact update
      await supabase.from('activity_log').insert({
        action_type: 'update',
        entry_id: id,
        entry_data: entry,
        changed_by: currentUserEmail || null,
        changes: { field: 'last_contacted', old_value: entry.last_contacted, new_value: now },
      });

      const { error } = await supabase
        .from('waitlist_entries')
        .update({ last_contacted: now })
        .eq('id', id);

      if (error) {
        console.error('Error updating last contacted:', error);
        alert('Failed to update contact date');
      } else {
        onRefresh();
      }
    } catch (err) {
      console.error('Exception updating contact:', err);
      alert('Failed to update contact date');
    }
  };

  const filteredAndSortedEntries = entries
    .filter(entry => {
      const matchesSearch = 
        entry.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.phone.includes(searchTerm);
      
      const matchesAgent = !agentFilter || agentFilter === 'all' || 
        (agentFilter === 'open' ? !entry.assigned_agent : entry.assigned_agent === agentFilter);
      
      const matchesStatus = statusFilter === 'all' || entry.status === statusFilter;
      
      const matchesProperty = !propertyFilter || propertyFilter === 'all' || 
        normalizePropertyName(entry.property) === propertyFilter;
      
      const matchesSection8 = !section8Filter || section8Filter === 'all' || 
        (section8Filter === 'yes' ? entry.is_section_8 : !entry.is_section_8);
      
      return matchesSearch && matchesAgent && matchesStatus && matchesProperty && matchesSection8;
    })
    .sort((a, b) => {
      // Always sort Internal Transfers first (Transfer First Rule)
      if (a.entry_type !== b.entry_type) {
        return a.entry_type === 'Internal Transfer' ? -1 : 1;
      }

      let comparison = 0;
      switch (sortField) {
        case 'created_at':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case 'full_name':
          comparison = a.full_name.localeCompare(b.full_name);
          break;
        case 'entry_type':
          comparison = a.entry_type.localeCompare(b.entry_type);
          break;
        case 'max_budget':
          comparison = a.max_budget - b.max_budget;
          break;
        case 'move_in_date':
          comparison = new Date(a.move_in_date).getTime() - new Date(b.move_in_date).getTime();
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'Active': return 'default';
      case 'Showing Scheduled': return 'secondary';
      case 'Applied': return 'outline';
      case 'Signed Lease': return 'destructive';
      default: return 'default';
    }
  };

  // Step-by-step filter handlers
  const handleAgentSelect = (value: string) => {
    setAgentFilter(value);
    setFilterStep(2);
  };

  const handlePropertySelect = (value: string) => {
    setPropertyFilter(value);
    setFilterStep(3);
  };

  const handleSection8Select = (value: string) => {
    setSection8Filter(value);
    setFiltersComplete(true);
  };

  const handleShowAll = () => {
    setAgentFilter('all');
    setPropertyFilter('all');
    setSection8Filter('all');
    setFiltersComplete(true);
  };

  const resetFilters = () => {
    setAgentFilter('');
    setPropertyFilter('');
    setSection8Filter('');
    setFilterStep(1);
    setFiltersComplete(false);
  };

  // Show step-by-step filter wizard if filters not complete
  if (!filtersComplete) {
    return (
      <div className="space-y-8">
        <div className="text-center py-4">
          <h2 className="text-2xl font-semibold mb-2">Select Your Filters</h2>
          <p className="text-muted-foreground">Choose filters below to view your waitlist</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {/* Step 1: Select Agent */}
          <div className={`p-6 rounded-xl border-2 transition-all ${agentFilter ? 'border-green-500 bg-green-50 dark:bg-green-950' : 'border-primary bg-primary/5'}`}>
            <div className="text-center mb-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold mx-auto mb-2 ${agentFilter ? 'bg-green-500 text-white' : 'bg-primary text-primary-foreground'}`}>
                {agentFilter ? '✓' : '1'}
              </div>
              <h3 className="font-semibold">Agent</h3>
            </div>
            <Select value={agentFilter} onValueChange={handleAgentSelect}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select agent..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Agents</SelectItem>
                <SelectItem value="open">Open Leads</SelectItem>
                <SelectItem value="Matthew Kaleb">Matthew Kaleb</SelectItem>
                <SelectItem value="Michael Dillon">Michael Dillon</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Step 2: Select Property */}
          <div className={`p-6 rounded-xl border-2 transition-all ${!agentFilter ? 'opacity-40 pointer-events-none border-muted' : propertyFilter ? 'border-green-500 bg-green-50 dark:bg-green-950' : 'border-primary bg-primary/5'}`}>
            <div className="text-center mb-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold mx-auto mb-2 ${propertyFilter ? 'bg-green-500 text-white' : agentFilter ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                {propertyFilter ? '✓' : '2'}
              </div>
              <h3 className="font-semibold">Property</h3>
            </div>
            <Select value={propertyFilter} onValueChange={handlePropertySelect} disabled={!agentFilter}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select property..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Properties</SelectItem>
                {PROPERTIES.map(property => (
                  <SelectItem key={property} value={property}>{property}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Step 3: Select Section 8 Filter */}
          <div className={`p-6 rounded-xl border-2 transition-all ${!propertyFilter ? 'opacity-40 pointer-events-none border-muted' : section8Filter ? 'border-green-500 bg-green-50 dark:bg-green-950' : 'border-primary bg-primary/5'}`}>
            <div className="text-center mb-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold mx-auto mb-2 ${section8Filter ? 'bg-green-500 text-white' : propertyFilter ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                {section8Filter ? '✓' : '3'}
              </div>
              <h3 className="font-semibold">Prospect Type</h3>
            </div>
            <Select value={section8Filter} onValueChange={handleSection8Select} disabled={!propertyFilter}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select type..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Prospects</SelectItem>
                <SelectItem value="yes">Section 8 Only</SelectItem>
                <SelectItem value="no">Non-Section 8</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Progress indicator */}
        <div className="flex justify-center gap-2">
          <div className={`h-2 w-16 rounded-full ${agentFilter ? 'bg-green-500' : 'bg-muted'}`} />
          <div className={`h-2 w-16 rounded-full ${propertyFilter ? 'bg-green-500' : 'bg-muted'}`} />
          <div className={`h-2 w-16 rounded-full ${section8Filter ? 'bg-green-500' : 'bg-muted'}`} />
        </div>

        {/* Show All Button */}
        <div className="flex justify-center mt-6">
          <Button variant="outline" size="lg" onClick={handleShowAll}>
            Show All Entries
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, or phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <Select value={agentFilter} onValueChange={setAgentFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by agent" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Agents</SelectItem>
            <SelectItem value="open">Open Leads</SelectItem>
            {uniqueAgents.map(agent => (
              <SelectItem key={agent} value={agent}>{agent}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Showing Scheduled">Showing Scheduled</SelectItem>
            <SelectItem value="Applied">Applied</SelectItem>
            <SelectItem value="Signed Lease">Signed Lease</SelectItem>
          </SelectContent>
        </Select>

        <Select value={propertyFilter} onValueChange={setPropertyFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by property" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Properties</SelectItem>
            {PROPERTIES.map(property => (
              <SelectItem key={property} value={property}>{property}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={section8Filter} onValueChange={setSection8Filter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Section 8" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Prospects</SelectItem>
            <SelectItem value="yes">Section 8 Only</SelectItem>
            <SelectItem value="no">Non-Section 8</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table className="table-fixed w-full">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">Type</TableHead>
              <TableHead className="w-[120px]">
                <Button variant="ghost" size="sm" onClick={() => handleSort('full_name')}>
                  Name <ArrowUpDown className="ml-1 h-3 w-3" />
                </Button>
              </TableHead>
              <TableHead className="w-[180px]">Contact</TableHead>
              <TableHead className="w-[90px]">Property</TableHead>
              <TableHead className="w-[100px]">Prefs</TableHead>
              <TableHead className="w-[70px]">
                <Button variant="ghost" size="sm" onClick={() => handleSort('max_budget')}>
                  Budget <ArrowUpDown className="ml-1 h-3 w-3" />
                </Button>
              </TableHead>
              <TableHead className="w-[150px]">
                <Button variant="ghost" size="sm" onClick={() => handleSort('move_in_date')}>
                  Move-in <ArrowUpDown className="ml-1 h-3 w-3" />
                </Button>
              </TableHead>
              <TableHead className="w-[110px]">Agent</TableHead>
              <TableHead className="w-[90px]">Contacted</TableHead>
              <TableHead className="w-[90px]">Status</TableHead>
              <TableHead className="w-[110px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAndSortedEntries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                  No entries found
                </TableCell>
              </TableRow>
            ) : (
              filteredAndSortedEntries.map((entry) => {
                const isExpanded = expandedRows.has(entry.id);
                const canModify = canModifyEntry(entry);
                return (
                  <>
                    <TableRow key={entry.id} className="cursor-pointer hover:bg-muted/50" onClick={() => toggleRowExpanded(entry.id)}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          <div>
                            <div className="flex items-center gap-1 flex-wrap">
                              <Badge variant={entry.entry_type === 'Internal Transfer' ? 'default' : 'secondary'}>
                                {entry.entry_type === 'Internal Transfer' ? '🏠 Transfer' : '👤 Prospect'}
                              </Badge>
                              {entry.is_section_8 && (
                                <Badge variant="outline" className="text-green-600 border-green-600 text-xs">
                                  S8
                                </Badge>
                              )}
                            </div>
                            {entry.current_unit_number && (
                              <span className="block text-xs text-muted-foreground mt-1">
                                Unit {entry.current_unit_number}
                              </span>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium truncate max-w-[120px]" title={entry.full_name}>
                        {entry.full_name}
                        {entry.internal_notes && (
                          <FileText className="inline ml-2 h-3 w-3 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell className="max-w-[180px]">
                        <div className="text-sm truncate" title={entry.email}>{entry.email}</div>
                        <div className="text-sm text-muted-foreground truncate">{entry.phone}</div>
                      </TableCell>
                      <TableCell className="max-w-[90px]">
                        <div className="text-sm font-medium truncate" title={entry.property}>
                          {entry.property || '-'}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[180px]">
                        <div className="text-sm">
                          <div>{entry.unit_type_pref}</div>
                          <div className="text-muted-foreground">{entry.floor_pref}</div>
                          {entry.preferred_units && (
                            <div className="text-xs text-blue-600 break-words whitespace-normal">Units: {entry.preferred_units}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>${entry.max_budget.toLocaleString()}</TableCell>
                      <TableCell>
                        {formatDateLocal(entry.move_in_date)}
                        {entry.move_in_date_end && (
                          <span className="text-muted-foreground"> - {formatDateLocal(entry.move_in_date_end)}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {entry.assigned_agent ? (
                          <div className="flex items-center gap-1">
                            <UserCircle className="h-4 w-4" />
                            <span className="text-sm">{entry.assigned_agent}</span>
                          </div>
                        ) : (
                          <Badge variant="outline" className="text-orange-600 border-orange-600">
                            Open Lead
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {entry.last_contacted ? (
                          <div className="text-xs text-muted-foreground">
                            {new Date(entry.last_contacted).toLocaleDateString()}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <select
                          value={entry.status}
                          onChange={(e) => handleStatusChange(entry.id, e.target.value)}
                          className="px-3 py-1 text-sm rounded-md border border-input bg-background cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring"
                        >
                          <option value="Active">Active</option>
                          <option value="Showing Scheduled">Showing Scheduled</option>
                          <option value="Applied">Applied</option>
                          <option value="Signed Lease">Signed Lease</option>
                        </select>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-green-500 hover:text-green-700 hover:bg-green-50"
                            onClick={() => handleMarkContacted(entry.id, entry)}
                            title="Mark as contacted"
                          >
                            <Phone className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className={canModify ? "text-blue-500 hover:text-blue-700 hover:bg-blue-50" : "text-gray-300 cursor-not-allowed"}
                            onClick={() => canModify && handleEditClick(entry)}
                            disabled={!canModify}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className={canModify ? "text-red-500 hover:text-red-700 hover:bg-red-50" : "text-gray-300 cursor-not-allowed"}
                            onClick={() => handleDelete(entry.id, entry.full_name, entry)}
                            disabled={!canModify}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow key={`${entry.id}-expanded`} className="bg-muted/30">
                        <TableCell colSpan={11} className="p-4">
                          <div>
                            <h4 className="font-semibold text-sm mb-2">Internal Notes</h4>
                            <div className="text-sm text-muted-foreground bg-white dark:bg-gray-800 p-3 rounded border min-h-[60px] max-w-full whitespace-pre-wrap break-words">
                              {entry.internal_notes || 'No notes added'}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div>
          Showing {filteredAndSortedEntries.length} of {entries.length} entries
          {filteredAndSortedEntries.some(e => e.entry_type === 'Internal Transfer') && (
            <span className="ml-2 text-blue-600">• Internal Transfers shown first</span>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={resetFilters}>
          Reset Filters
        </Button>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingEntry} onOpenChange={(open) => !open && setEditingEntry(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Entry: {editingEntry?.full_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Entry Type and Section 8 Toggles */}
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="edit-is-transfer"
                  checked={editForm.entry_type === 'Internal Transfer'}
                  onChange={(e) => {
                    const isTransfer = e.target.checked;
                    setEditForm({ 
                      ...editForm, 
                      entry_type: isTransfer ? 'Internal Transfer' : 'Prospect',
                      current_unit_number: isTransfer ? editForm.current_unit_number : ''
                    });
                  }}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="edit-is-transfer">Current Resident (Internal Transfer)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="edit-is-section8"
                  checked={editForm.is_section_8 || false}
                  onChange={(e) => setEditForm({ ...editForm, is_section_8: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="edit-is-section8">Section 8</Label>
              </div>
            </div>

            {/* Current Unit Number - only show for Internal Transfer */}
            {editForm.entry_type === 'Internal Transfer' && (
              <div className="space-y-2">
                <Label htmlFor="edit-current-unit">Current Unit Number</Label>
                <Input
                  id="edit-current-unit"
                  value={editForm.current_unit_number || ''}
                  onChange={(e) => setEditForm({ ...editForm, current_unit_number: e.target.value })}
                  placeholder="e.g., 301"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Full Name *</Label>
                <Input
                  id="edit-name"
                  value={editForm.full_name || ''}
                  onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-email">Email</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={editForm.email || ''}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-phone">Phone</Label>
                <Input
                  id="edit-phone"
                  value={editForm.phone || ''}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-agent">Assigned Agent *</Label>
                {editingEntry && !canChangeAgent(editingEntry) ? (
                  <div>
                    <Input
                      value={editForm.assigned_agent || 'Unassigned'}
                      disabled
                      className="bg-gray-100"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Only {editingEntry.assigned_agent} can reassign this entry</p>
                  </div>
                ) : (
                  <div>
                    <Select
                      value={editForm.assigned_agent || ''}
                      onValueChange={(value) => setEditForm({ ...editForm, assigned_agent: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select agent" />
                      </SelectTrigger>
                      <SelectContent>
                        {AGENTS.map(a => (
                          <SelectItem key={a} value={a}>{a === 'Unassigned' ? 'Unassigned Agent' : a}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {editingEntry && isUnassigned(editingEntry.assigned_agent) && currentAgent && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() => setEditForm({ ...editForm, assigned_agent: currentAgent })}
                      >
                        Assign to me ({currentAgent})
                      </Button>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-property">Property *</Label>
                <Select
                  value={editForm.property || ''}
                  onValueChange={(value) => setEditForm({ ...editForm, property: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select property" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROPERTIES.map(p => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Unit Type * <span className="text-xs text-muted-foreground">(select all that apply)</span></Label>
                <div className="flex flex-wrap gap-3 p-3 border rounded-md">
                  {['Studio', '1BR', '2BR', '3BR', '4BR'].map(unitType => {
                    const currentTypes = (editForm.unit_type_pref || '').split(',').map(t => t.trim()).filter(Boolean);
                    const isChecked = currentTypes.includes(unitType);
                    return (
                      <label key={unitType} className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            let newTypes: string[];
                            if (e.target.checked) {
                              newTypes = [...currentTypes, unitType];
                            } else {
                              newTypes = currentTypes.filter(t => t !== unitType);
                            }
                            setEditForm({ ...editForm, unit_type_pref: newTypes.join(', ') });
                          }}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        <span className="text-sm">{unitType}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              {/* Unit Numbers - only show if property has units defined */}
              {editForm.property && PROPERTY_UNITS[editForm.property] && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Unit Numbers <span className="text-xs text-muted-foreground">(optional)</span></Label>
                    <Select
                      value=""
                      onValueChange={(value) => {
                        const currentUnits = (editForm.preferred_units || '').split(',').map(u => u.trim()).filter(Boolean);
                        if (value && !currentUnits.includes(value)) {
                          const newUnits = [...currentUnits, value];
                          setEditForm({ ...editForm, preferred_units: newUnits.join(', ') });
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select unit..." />
                      </SelectTrigger>
                      <SelectContent className="max-h-[200px]">
                        {PROPERTY_UNITS[editForm.property].map(unit => {
                          const currentUnits = (editForm.preferred_units || '').split(',').map(u => u.trim()).filter(Boolean);
                          return (
                            <SelectItem 
                              key={unit} 
                              value={unit}
                              disabled={currentUnits.includes(unit)}
                            >
                              {unit} {currentUnits.includes(unit) ? '✓' : ''}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    {editForm.preferred_units ? (
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Selected Units</Label>
                        <div className="flex flex-wrap gap-1">
                          {editForm.preferred_units.split(',').map(u => u.trim()).filter(Boolean).map(unit => (
                            <span 
                              key={unit} 
                              className="inline-flex items-center gap-1 bg-primary/10 text-primary px-2 py-1 rounded text-sm"
                            >
                              {unit}
                              <button
                                type="button"
                                onClick={() => {
                                  const currentUnits = editForm.preferred_units!.split(',').map(u => u.trim()).filter(Boolean);
                                  const newUnits = currentUnits.filter(u => u !== unit);
                                  setEditForm({ ...editForm, preferred_units: newUnits.join(', ') });
                                }}
                                className="hover:text-red-500"
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground mt-6">No units selected (matches all)</div>
                    )}
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="edit-floor-pref">Floor Preference</Label>
                <Select
                  value={editForm.floor_pref || 'No Preference'}
                  onValueChange={(value) => setEditForm({ ...editForm, floor_pref: value as any })}
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
              <div className="space-y-2">
                <Label htmlFor="edit-budget">Max Budget ($)</Label>
                <Input
                  id="edit-budget"
                  type="number"
                  value={editForm.max_budget || ''}
                  onChange={(e) => setEditForm({ ...editForm, max_budget: parseInt(e.target.value) || 0 })}
                  placeholder="2000"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-status">Status</Label>
                <Select
                  value={editForm.status || ''}
                  onValueChange={(value) => setEditForm({ ...editForm, status: value as any })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Showing Scheduled">Showing Scheduled</SelectItem>
                    <SelectItem value="Applied">Applied</SelectItem>
                    <SelectItem value="Signed Lease">Signed Lease</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Move-in Date Section */}
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-move-in">Move-in Date {editForm.move_in_date_end ? '(Start)' : ''} *</Label>
                  <Input
                    id="edit-move-in"
                    type="date"
                    value={editForm.move_in_date || ''}
                    onChange={(e) => setEditForm({ ...editForm, move_in_date: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-move-in-end">Move-in End Date (optional)</Label>
                  <Input
                    id="edit-move-in-end"
                    type="date"
                    value={editForm.move_in_date_end || ''}
                    onChange={(e) => setEditForm({ ...editForm, move_in_date_end: e.target.value || null })}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Set an end date to create a move-in date range</p>
              <div className="flex items-center space-x-2 mt-2">
                <input
                  type="checkbox"
                  id="edit-extended-retention"
                  checked={editForm.extended_retention || false}
                  onChange={(e) => setEditForm({ ...editForm, extended_retention: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="edit-extended-retention" className="text-sm font-normal cursor-pointer">Keep 1 year (instead of 1 month)</Label>
              </div>
              {editForm.extended_retention && (
                <p className="text-xs text-muted-foreground">Entry will be retained for 1 year after move-in date instead of 1 month</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-notes">Internal Notes</Label>
              <textarea
                id="edit-notes"
                className="w-full min-h-[100px] p-2 border rounded-md text-sm"
                value={editForm.internal_notes || ''}
                onChange={(e) => setEditForm({ ...editForm, internal_notes: e.target.value })}
                placeholder="Add notes about this entry..."
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditingEntry(null)}>
              Cancel
            </Button>
            <Button onClick={handleEditSave}>
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
