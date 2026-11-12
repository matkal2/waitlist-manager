'use client';

import { Fragment, useState, useEffect } from 'react';
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
import { ArrowUpDown, Search, ChevronDown, ChevronUp, Pencil, FileText, Phone, Users, UserPlus, Sparkles, X } from 'lucide-react';
import { PROPERTY_UNITS } from '@/lib/property-units';
import { ASSIGNABLE_AGENTS } from '@/lib/assignable-agents';
import { getPropertyNicknames } from '@/lib/properties';
import { getUnitMatchType, normalizePropertyName, type MatchableUnit } from '@/lib/waitlist-matching';
import { getArchiveDate } from '@/lib/waitlist-retention';
import { OutcomeTracker } from '@/components/outcome-tracker';

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
  units?: MatchableUnit[];
}

type SortField = 'created_at' | 'full_name' | 'entry_type' | 'max_budget' | 'move_in_date';
type SortOrder = 'asc' | 'desc';
type QuickFilter = 'mine' | 'open' | 'transfers' | 'section8' | 'matched';
const QUICK_FILTERS: QuickFilter[] = ['mine', 'open', 'transfers', 'section8', 'matched'];

const PROPERTIES = getPropertyNicknames();


// Days since last contact before a lead is flagged amber / red
const FOLLOW_UP_WARN_DAYS = 14;
const FOLLOW_UP_DUE_DAYS = 30;

// Format date without timezone shift (parses YYYY-MM-DD as local date)
const formatDateLocal = (dateString: string) => {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString();
};

const formatAvailableDate = (value: string | null) =>
  !value ? 'Now' : /^\d{4}-\d{2}-\d{2}$/.test(value) ? formatDateLocal(value) : value;

const daysSince = (iso: string | null) =>
  iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)) : null;

const followUpLevel = (entry: WaitlistEntry): 'ok' | 'warn' | 'due' => {
  const days = daysSince(entry.last_contacted);
  if (days === null || days >= FOLLOW_UP_DUE_DAYS) return 'due';
  return days >= FOLLOW_UP_WARN_DAYS ? 'warn' : 'ok';
};

const formatWait = (iso: string) => {
  const days = daysSince(iso) ?? 0;
  if (days < 31) return `${days} days`;
  const months = Math.floor(days / 30.4);
  return months < 12 ? `${months} mo` : `${(months / 12).toFixed(1)} yr`;
};

export function WaitlistTable({ entries, onRefresh, currentUserEmail, units = [] }: WaitlistTableProps) {
  // Check if this is a page refresh - if so, clear session filters
  const isPageRefresh = typeof window !== 'undefined' && 
    performance.getEntriesByType('navigation').length > 0 &&
    (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming)?.type === 'reload';
  
  // Initialize filters from sessionStorage (persists during app use, but not on refresh/browser close)
  const getSessionFilter = (key: string, defaultValue: string) => {
    if (typeof window === 'undefined' || isPageRefresh) return defaultValue;
    return sessionStorage.getItem(key) || defaultValue;
  };

  const agents = [...ASSIGNABLE_AGENTS, 'Unassigned'];
  const [searchTerm, setSearchTerm] = useState('');
  const [agentFilter, setAgentFilter] = useState<string>(() => getSessionFilter('wl_agent', 'all'));
  const [statusFilter, setStatusFilter] = useState<string>(() => getSessionFilter('wl_status', 'all'));
  const [propertyFilter, setPropertyFilter] = useState<string>(() => getSessionFilter('wl_property', 'none'));
  const [quickFilters, setQuickFilters] = useState<Set<QuickFilter>>(
    () => new Set(getSessionFilter('wl_quick', '').split(',').filter(f => QUICK_FILTERS.includes(f as QuickFilter)) as QuickFilter[])
  );
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [editingEntry, setEditingEntry] = useState<WaitlistEntry | null>(null);
  const [editForm, setEditForm] = useState<Partial<WaitlistEntry>>({});

  // Save filters to sessionStorage when they change (persists during session, clears on browser close)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('wl_agent', agentFilter);
      sessionStorage.setItem('wl_status', statusFilter);
      sessionStorage.setItem('wl_property', propertyFilter);
      sessionStorage.setItem('wl_quick', [...quickFilters].join(','));
    }
  }, [agentFilter, statusFilter, propertyFilter, quickFilters]);

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

  // Links from match alert emails (?entry=<id>) open that person's property and row
  useEffect(() => {
    const entryId = new URLSearchParams(window.location.search).get('entry');
    const target = entryId ? entries.find(e => e.id === entryId) : undefined;
    if (!target) return;
    setSearchTerm('');
    setAgentFilter('all');
    setStatusFilter('all');
    setQuickFilters(new Set());
    setPropertyFilter(normalizePropertyName(target.property) || 'No property');
    setExpandedRows(prev => new Set(prev).add(target.id));
    window.history.replaceState(null, '', window.location.pathname);
    setTimeout(() => document.getElementById(`entry-${target.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
  }, [entries]);

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

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const unitMatchesByEntry = new Map<string, MatchableUnit[]>();
  for (const entry of entries) {
    const matched = units.filter(unit => getUnitMatchType(entry, unit, today) !== null);
    if (matched.length > 0) unitMatchesByEntry.set(entry.id, matched);
  }

  const passesQuickFilter = (entry: WaitlistEntry, filter: QuickFilter) => {
    switch (filter) {
      case 'mine': return !!currentAgent && entry.assigned_agent === currentAgent;
      case 'open': return isUnassigned(entry.assigned_agent);
      case 'transfers': return entry.entry_type === 'Internal Transfer';
      case 'section8': return entry.is_section_8;
      case 'matched': return unitMatchesByEntry.has(entry.id);
      default: return true;
    }
  };

  const toggleQuickFilter = (filter: QuickFilter) => {
    setQuickFilters(prev => {
      const next = new Set(prev);
      if (next.has(filter)) next.delete(filter);
      else next.add(filter);
      return next;
    });
  };

  const clearFilters = () => {
    setSearchTerm('');
    setAgentFilter('all');
    setStatusFilter('all');
    setQuickFilters(new Set());
  };

  const query = searchTerm.trim().toLowerCase();
  const filteredEntries = entries.filter(entry => {
    const matchesSearch = !query ||
      entry.full_name.toLowerCase().includes(query) ||
      (entry.email || '').toLowerCase().includes(query) ||
      (entry.phone || '').includes(query);
    const matchesAgent = !agentFilter || agentFilter === 'all' ||
      (agentFilter === 'open' ? isUnassigned(entry.assigned_agent) : entry.assigned_agent === agentFilter);
    const matchesStatus = statusFilter === 'all' || entry.status === statusFilter;
    const matchesQuick = [...quickFilters].every(filter => passesQuickFilter(entry, filter));
    return matchesSearch && matchesAgent && matchesStatus && matchesQuick;
  });

  const sortEntries = (list: WaitlistEntry[]) => [...list].sort((a, b) => {
    // Always sort Internal Transfers first (Transfer First Rule)
    if (a.entry_type !== b.entry_type) {
      return a.entry_type === 'Internal Transfer' ? -1 : 1;
    }
    let comparison = 0;
    switch (sortField) {
      case 'full_name': comparison = a.full_name.localeCompare(b.full_name); break;
      case 'max_budget': comparison = a.max_budget - b.max_budget; break;
      case 'move_in_date': comparison = a.move_in_date.localeCompare(b.move_in_date); break;
      case 'entry_type': comparison = a.entry_type.localeCompare(b.entry_type); break;
      default: comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    }
    return sortOrder === 'asc' ? comparison : -comparison;
  });

  const propertyOf = (entry: WaitlistEntry) => normalizePropertyName(entry.property) || 'No property';
  const propertyNames = [...new Set(entries.map(propertyOf))].sort((a, b) => a.localeCompare(b));
  const entriesByProperty = new Map<string, WaitlistEntry[]>();
  for (const entry of filteredEntries) {
    const property = propertyOf(entry);
    entriesByProperty.set(property, [...(entriesByProperty.get(property) || []), entry]);
  }
  const selectedProperty = propertyNames.includes(propertyFilter) ? propertyFilter : null;
  const visibleEntries = selectedProperty ? (entriesByProperty.get(selectedProperty) || []) : [];
  const hasActiveFilters = !!query || (!!agentFilter && agentFilter !== 'all') || statusFilter !== 'all' || quickFilters.size > 0;

  const summaryCards: { key: QuickFilter | null; label: string; value: number; icon: typeof Users; tone: string; iconBg: string }[] = [
    { key: null, label: 'On the waitlist', value: entries.length, icon: Users, tone: 'text-blue-600', iconBg: 'bg-blue-50 dark:bg-blue-950' },
    { key: 'open', label: 'Unassigned leads', value: entries.filter(e => isUnassigned(e.assigned_agent)).length, icon: UserPlus, tone: 'text-orange-600', iconBg: 'bg-orange-50 dark:bg-orange-950' },
    { key: 'matched', label: 'Matched to a unit now', value: unitMatchesByEntry.size, icon: Sparkles, tone: 'text-green-600', iconBg: 'bg-green-50 dark:bg-green-950' },
  ];

  const quickFilterOptions: { key: QuickFilter; label: string }[] = [
    ...(currentAgent ? [{ key: 'mine' as const, label: 'My leads' }] : []),
    { key: 'open', label: 'Unassigned' },
    { key: 'transfers', label: 'Transfers' },
    { key: 'section8', label: 'Section 8' },
    { key: 'matched', label: 'Matched now' },
  ];

  const renderContacted = (entry: WaitlistEntry) => {
    const level = followUpLevel(entry);
    const days = daysSince(entry.last_contacted);
    const color = level === 'due' ? 'text-red-600' : level === 'warn' ? 'text-amber-600' : 'text-muted-foreground';
    return (
      <span
        className={`text-xs font-medium ${color}`}
        title={entry.last_contacted ? new Date(entry.last_contacted).toLocaleDateString() : 'Never contacted'}
      >
        {days === null ? 'Never' : days === 0 ? 'Today' : `${days}d ago`}
      </span>
    );
  };

  const renderTable = (list: WaitlistEntry[], showProperty = false) => (
    <div className="rounded-lg border overflow-x-auto bg-white dark:bg-gray-900">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead className="min-w-[220px]">
              <Button variant="ghost" size="sm" className="-ml-3" onClick={() => handleSort('full_name')}>
                Name <ArrowUpDown className="ml-1 h-3 w-3" />
              </Button>
            </TableHead>
            <TableHead>
              <Button variant="ghost" size="sm" className="-ml-3" onClick={() => handleSort('max_budget')}>
                Wants <ArrowUpDown className="ml-1 h-3 w-3" />
              </Button>
            </TableHead>
            <TableHead>
              <Button variant="ghost" size="sm" className="-ml-3" onClick={() => handleSort('move_in_date')}>
                Move-in <ArrowUpDown className="ml-1 h-3 w-3" />
              </Button>
            </TableHead>
            <TableHead>Agent</TableHead>
            <TableHead>Contacted</TableHead>
            <TableHead>Outcome</TableHead>
            <TableHead className="w-[90px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortEntries(list).map(entry => {
            const isExpanded = expandedRows.has(entry.id);
            const canModify = canModifyEntry(entry);
            const matchedUnits = unitMatchesByEntry.get(entry.id) || [];
            return (
              <Fragment key={entry.id}>
                <TableRow id={`entry-${entry.id}`} className="cursor-pointer hover:bg-muted/50" onClick={() => toggleRowExpanded(entry.id)}>
                  <TableCell>
                    <div className="flex items-start gap-2">
                      {isExpanded
                        ? <ChevronUp className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                        : <ChevronDown className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />}
                      <div className="min-w-0">
                        <div className="font-medium truncate" title={entry.full_name}>
                          {entry.full_name}
                          {entry.internal_notes && <FileText className="inline ml-2 h-3 w-3 text-muted-foreground" />}
                        </div>
                        <div className="flex flex-wrap items-center gap-1 mt-1">
                          {entry.entry_type === 'Internal Transfer'
                            ? <Badge className="text-xs">Transfer</Badge>
                            : <Badge variant="secondary" className="text-xs">Prospect</Badge>}
                          {showProperty && (
                            <Badge variant="outline" className="text-xs">{propertyOf(entry)}</Badge>
                          )}
                          {entry.is_section_8 && (
                            <Badge variant="outline" className="text-green-600 border-green-600 text-xs">S8</Badge>
                          )}
                          {matchedUnits.length > 0 && (
                            <Badge variant="outline" className="text-xs border-green-300 bg-green-50 text-green-700">
                              {matchedUnits.length} unit{matchedUnits.length !== 1 ? 's' : ''} match
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{entry.unit_type_pref}</div>
                    <div className="text-xs text-muted-foreground">
                      {entry.max_budget > 0 ? `Up to $${entry.max_budget.toLocaleString()}` : 'Any budget'}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {formatDateLocal(entry.move_in_date)}
                    {entry.move_in_date_end && (
                      <div className="text-xs text-muted-foreground">to {formatDateLocal(entry.move_in_date_end)}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    {isUnassigned(entry.assigned_agent) ? (
                      <Badge variant="outline" className="text-orange-600 border-orange-600">Unassigned</Badge>
                    ) : (
                      <span className="text-sm">{entry.assigned_agent}</span>
                    )}
                  </TableCell>
                  <TableCell>{renderContacted(entry)}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <OutcomeTracker entryId={entry.id} currentStatus={entry.outcome_status} onUpdate={onRefresh} />
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center">
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
                        className={canModify ? 'text-blue-500 hover:text-blue-700 hover:bg-blue-50' : 'text-gray-300 cursor-not-allowed'}
                        onClick={() => canModify && handleEditClick(entry)}
                        disabled={!canModify}
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                {isExpanded && (
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableCell colSpan={7} className="p-4">
                      <div className="grid gap-4 md:grid-cols-3 text-sm">
                        <div className="space-y-1">
                          <h4 className="font-semibold">Contact</h4>
                          <div className="break-all">{entry.email || 'No email'}</div>
                          <div>{entry.phone || 'No phone'}</div>
                          {entry.current_unit_number && (
                            <div className="text-muted-foreground">Current unit {entry.current_unit_number}</div>
                          )}
                        </div>
                        <div className="space-y-1">
                          <h4 className="font-semibold">Details</h4>
                          <div>Floor: {entry.floor_pref || 'No Preference'}</div>
                          {entry.preferred_units && (
                            <div className="text-blue-600 break-words">Units: {entry.preferred_units}</div>
                          )}
                          <div>Status: {entry.status}</div>
                          {getArchiveDate(entry) && (
                            <div className="text-muted-foreground">
                              Moves to archive {getArchiveDate(entry)!.toLocaleDateString()}
                            </div>
                          )}
                          <div className="text-muted-foreground">
                            On list since {new Date(entry.created_at).toLocaleDateString()} ({formatWait(entry.created_at)})
                          </div>
                        </div>
                        <div className="space-y-1">
                          <h4 className="font-semibold">Matching units</h4>
                          {matchedUnits.length === 0 ? (
                            <div className="text-muted-foreground">None available right now</div>
                          ) : (
                            matchedUnits.map(unit => (
                              <div key={unit.unique_id || unit.unit_number}>
                                Unit {unit.unit_number} · {unit.unit_type} · ${unit.rent_price.toLocaleString()} · {formatAvailableDate(unit.available_date)}
                              </div>
                            ))
                          )}
                        </div>
                        <div className="md:col-span-3">
                          <h4 className="font-semibold mb-1">Internal Notes</h4>
                          <div className="text-muted-foreground bg-white dark:bg-gray-800 p-3 rounded border whitespace-pre-wrap break-words">
                            {entry.internal_notes || 'No notes added'}
                          </div>
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
      {/* Summary cards (click to filter) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {summaryCards.map(card => {
          const Icon = card.icon;
          const active = card.key !== null && quickFilters.has(card.key);
          return (
            <button
              key={card.label}
              type="button"
              onClick={() => (card.key ? toggleQuickFilter(card.key) : setQuickFilters(new Set()))}
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

      {/* Search + filters */}
      <div className="space-y-3 rounded-xl border bg-white dark:bg-gray-900 p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={agentFilter || 'all'} onValueChange={setAgentFilter}>
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="Agent" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All agents</SelectItem>
              <SelectItem value="open">Unassigned</SelectItem>
              {uniqueAgents.filter(agent => !isUnassigned(agent)).map(agent => (
                <SelectItem key={agent} value={agent}>{agent}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="Showing Scheduled">Showing Scheduled</SelectItem>
              <SelectItem value="Applied">Applied</SelectItem>
              <SelectItem value="Signed Lease">Signed Lease</SelectItem>
            </SelectContent>
          </Select>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="h-4 w-4 mr-1" />
              Clear
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {quickFilterOptions.map(option => {
            const active = quickFilters.has(option.key);
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => toggleQuickFilter(option.key)}
                className={`rounded-full border px-3 py-1 text-sm transition ${active ? 'border-blue-600 bg-blue-600 text-white' : 'bg-white dark:bg-gray-900 text-muted-foreground hover:bg-muted hover:text-foreground'}`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Property tiles: click to open, click again to close */}
      <div>
        <h3 className="mb-2 text-sm font-medium text-muted-foreground">Properties</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3">
          {propertyNames.map(property => {
            const list = entriesByProperty.get(property) || [];
            const matched = list.filter(e => unitMatchesByEntry.has(e.id)).length;
            const active = selectedProperty === property;
            return (
              <button
                key={property}
                type="button"
                onClick={() => setPropertyFilter(active ? 'none' : property)}
                className={`flex flex-col items-center rounded-xl border px-3 py-4 text-center shadow-sm transition-all ${active ? 'border-blue-600 bg-blue-600 text-white shadow-md' : 'bg-white dark:bg-gray-900 hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md'} ${list.length === 0 && !active ? 'opacity-60' : ''}`}
              >
                <span className={`max-w-full truncate text-sm font-medium ${active ? 'text-blue-50' : 'text-muted-foreground'}`} title={property}>
                  {property}
                </span>
                <span className={`mt-2 text-4xl font-bold tabular-nums leading-none ${active ? 'text-white' : 'text-gray-900 dark:text-gray-50'}`}>
                  {list.length}
                </span>
                <span className={`mt-1 text-xs ${active ? 'text-blue-100' : 'text-muted-foreground'}`}>on waitlist</span>
                <span
                  className={`mt-3 inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${matched > 0 ? (active ? 'bg-white/20 text-white' : 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300') : (active ? 'text-blue-100' : 'text-muted-foreground')}`}
                >
                  {matched > 0 ? (
                    <>
                      <Sparkles className="h-3 w-3" />
                      {matched} matched
                    </>
                  ) : 'No matches'}
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
                {visibleEntries.length} {visibleEntries.length === 1 ? 'entry' : 'entries'} · Internal Transfers shown first
              </span>
            </h3>
            <Button variant="ghost" size="sm" onClick={() => setPropertyFilter('none')}>
              <X className="h-4 w-4 mr-1" />
              Close
            </Button>
          </div>
          {visibleEntries.length === 0 ? (
            <div className="rounded-xl border border-dashed py-10 text-center text-muted-foreground">
              No entries at {selectedProperty} match these filters
            </div>
          ) : renderTable(visibleEntries)}
        </div>
      ) : query ? (
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
          ) : renderTable(filteredEntries, true)}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
          Select a property above to see its waitlist, or search by name.
        </div>
      )}

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
                        {agents.map(a => (
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
