'use client';

import { useState } from 'react';
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
import { ArrowUpDown, Search, UserCircle, Trash2, ChevronDown, ChevronUp, Pencil, FileText } from 'lucide-react';

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

const PROPERTIES = [
  '246 Green Bay', '440 Green Bay', '546 Green Bay', 'Broadway', 'Countryside C',
  'Countryside T', 'Elston', 'Fullerton', 'Greenleaf', 'Kedzie', 'Kennedy',
  'Liberty', 'N. Clark', 'Park', 'Rogers', 'Sheffield', 'Talman', 'W. Chicago',
  'W. Montrose', 'Warren'
];

const AGENTS = ['Matthew Kaleb', 'Michael Dillon'];

export function WaitlistTable({ entries, onRefresh, currentUserEmail }: WaitlistTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [propertyFilter, setPropertyFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [editingEntry, setEditingEntry] = useState<WaitlistEntry | null>(null);
  const [editForm, setEditForm] = useState<Partial<WaitlistEntry>>({});

  // Get current user's agent name from email
  const currentAgent = currentUserEmail ? EMAIL_TO_AGENT[currentUserEmail] : null;

  // Check if user can edit/delete an entry
  const canModifyEntry = (entry: WaitlistEntry) => {
    if (!currentAgent) return true; // If no agent mapping, allow all (fallback)
    return entry.assigned_agent === currentAgent;
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
      internal_notes: entry.internal_notes,
      assigned_agent: entry.assigned_agent,
      status: entry.status,
      entry_type: entry.entry_type,
      current_unit_number: entry.current_unit_number,
    });
  };

  const handleEditSave = async () => {
    if (!editingEntry) return;

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
    const { error } = await supabase
      .from('waitlist_entries')
      .update({ status: newStatus })
      .eq('id', id);

    if (error) {
      console.error('Error updating status:', error);
      alert('Failed to update status');
    } else {
      onRefresh();
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

  const filteredAndSortedEntries = entries
    .filter(entry => {
      const matchesSearch = 
        entry.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.phone.includes(searchTerm);
      
      const matchesAgent = agentFilter === 'all' || 
        (agentFilter === 'open' ? !entry.assigned_agent : entry.assigned_agent === agentFilter);
      
      const matchesStatus = statusFilter === 'all' || entry.status === statusFilter;
      
      const matchesProperty = propertyFilter === 'all' || entry.property === propertyFilter;
      
      return matchesSearch && matchesAgent && matchesStatus && matchesProperty;
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
      case 'Contacted': return 'secondary';
      case 'Leased': return 'outline';
      case 'Closed': return 'destructive';
      default: return 'default';
    }
  };

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
            <SelectItem value="Contacted">Contacted</SelectItem>
            <SelectItem value="Leased">Leased</SelectItem>
            <SelectItem value="Closed">Closed</SelectItem>
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
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>
                <Button variant="ghost" size="sm" onClick={() => handleSort('full_name')}>
                  Name <ArrowUpDown className="ml-1 h-3 w-3" />
                </Button>
              </TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Property</TableHead>
              <TableHead>Preferences</TableHead>
              <TableHead>
                <Button variant="ghost" size="sm" onClick={() => handleSort('max_budget')}>
                  Budget <ArrowUpDown className="ml-1 h-3 w-3" />
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" size="sm" onClick={() => handleSort('move_in_date')}>
                  Move-in <ArrowUpDown className="ml-1 h-3 w-3" />
                </Button>
              </TableHead>
              <TableHead>Agent</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
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
                            <Badge variant={entry.entry_type === 'Internal Transfer' ? 'default' : 'secondary'}>
                              {entry.entry_type === 'Internal Transfer' ? '🏠 Transfer' : '👤 Prospect'}
                            </Badge>
                            {entry.current_unit_number && (
                              <span className="block text-xs text-muted-foreground mt-1">
                                Unit {entry.current_unit_number}
                              </span>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                        {entry.full_name}
                        {entry.internal_notes && (
                          <FileText className="inline ml-2 h-3 w-3 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>{entry.email}</div>
                          <div className="text-muted-foreground">{entry.phone}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">
                          {entry.property || '-'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>{entry.unit_type_pref}</div>
                          <div className="text-muted-foreground">{entry.floor_pref}</div>
                          {entry.preferred_units && (
                            <div className="text-xs text-blue-600">Units: {entry.preferred_units}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>${entry.max_budget.toLocaleString()}</TableCell>
                      <TableCell>{new Date(entry.move_in_date).toLocaleDateString()}</TableCell>
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
                        <Select
                          value={entry.status}
                          onValueChange={(value) => handleStatusChange(entry.id, value)}
                          disabled={!canModify}
                        >
                          <SelectTrigger className="w-[120px]">
                            <Badge variant={getStatusBadgeVariant(entry.status) as any}>
                              {entry.status}
                            </Badge>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Active">Active</SelectItem>
                            <SelectItem value="Contacted">Contacted</SelectItem>
                            <SelectItem value="Leased">Leased</SelectItem>
                            <SelectItem value="Closed">Closed</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
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
                        <TableCell colSpan={10} className="p-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <h4 className="font-semibold text-sm mb-2">Internal Notes</h4>
                              <p className="text-sm text-muted-foreground bg-white dark:bg-gray-800 p-3 rounded border min-h-[60px]">
                                {entry.internal_notes || 'No notes added'}
                              </p>
                            </div>
                            <div>
                              <h4 className="font-semibold text-sm mb-2">Entry Details</h4>
                              <div className="text-sm space-y-1 bg-white dark:bg-gray-800 p-3 rounded border">
                                <p><span className="text-muted-foreground">Created:</span> {new Date(entry.created_at).toLocaleString()}</p>
                                <p><span className="text-muted-foreground">Entry ID:</span> {entry.id.slice(0, 8)}...</p>
                                {entry.preferred_units && (
                                  <p><span className="text-muted-foreground">Preferred Units:</span> {entry.preferred_units}</p>
                                )}
                              </div>
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

      <div className="text-sm text-muted-foreground">
        Showing {filteredAndSortedEntries.length} of {entries.length} entries
        {filteredAndSortedEntries.some(e => e.entry_type === 'Internal Transfer') && (
          <span className="ml-2 text-blue-600">• Internal Transfers shown first</span>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingEntry} onOpenChange={(open) => !open && setEditingEntry(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Entry: {editingEntry?.full_name}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Full Name</Label>
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
              <Label htmlFor="edit-property">Property</Label>
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
              <Label htmlFor="edit-unit-type">Unit Type</Label>
              <Select
                value={editForm.unit_type_pref || ''}
                onValueChange={(value) => setEditForm({ ...editForm, unit_type_pref: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select unit type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Studio">Studio</SelectItem>
                  <SelectItem value="1BR">1 Bedroom</SelectItem>
                  <SelectItem value="2BR">2 Bedroom</SelectItem>
                  <SelectItem value="3BR">3 Bedroom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-budget">Max Budget</Label>
              <Input
                id="edit-budget"
                type="number"
                value={editForm.max_budget || ''}
                onChange={(e) => setEditForm({ ...editForm, max_budget: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-move-in">Move-in Date</Label>
              <Input
                id="edit-move-in"
                type="date"
                value={editForm.move_in_date || ''}
                onChange={(e) => setEditForm({ ...editForm, move_in_date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-agent">Assigned Agent</Label>
              <Select
                value={editForm.assigned_agent || ''}
                onValueChange={(value) => setEditForm({ ...editForm, assigned_agent: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select agent" />
                </SelectTrigger>
                <SelectContent>
                  {AGENTS.map(a => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                  <SelectItem value="Contacted">Contacted</SelectItem>
                  <SelectItem value="Leased">Leased</SelectItem>
                  <SelectItem value="Closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-preferred-units">Preferred Units</Label>
              <Input
                id="edit-preferred-units"
                value={editForm.preferred_units || ''}
                onChange={(e) => setEditForm({ ...editForm, preferred_units: e.target.value })}
                placeholder="e.g., 101, 205, 310"
              />
            </div>
            <div className="col-span-2 space-y-2">
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
