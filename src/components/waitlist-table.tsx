'use client';

import { useState } from 'react';
import { WaitlistEntry } from '@/types/database';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { supabase } from '@/lib/supabase';
import { ArrowUpDown, Search, UserCircle, Trash2 } from 'lucide-react';

interface WaitlistTableProps {
  entries: WaitlistEntry[];
  onRefresh: () => void;
}

type SortField = 'created_at' | 'full_name' | 'entry_type' | 'max_budget' | 'move_in_date';
type SortOrder = 'asc' | 'desc';

const PROPERTIES = [
  '246 Green Bay', '440 Green Bay', '546 Green Bay', 'Broadway', 'Countryside C',
  'Countryside T', 'Elston', 'Fullerton', 'Greenleaf', 'Kedzie', 'Kennedy',
  'Liberty', 'N. Clark', 'Park', 'Rogers', 'Sheffield', 'Talman', 'W. Chicago',
  'W. Montrose', 'Warren'
];

export function WaitlistTable({ entries, onRefresh }: WaitlistTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [propertyFilter, setPropertyFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

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

  const handleDelete = async (id: string, name: string) => {
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
              filteredAndSortedEntries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>
                    <Badge variant={entry.entry_type === 'Internal Transfer' ? 'default' : 'secondary'}>
                      {entry.entry_type === 'Internal Transfer' ? '🏠 Transfer' : '👤 Prospect'}
                    </Badge>
                    {entry.current_unit_number && (
                      <span className="block text-xs text-muted-foreground mt-1">
                        Unit {entry.current_unit_number}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{entry.full_name}</TableCell>
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
                  <TableCell>
                    <Select
                      value={entry.status}
                      onValueChange={(value) => handleStatusChange(entry.id, value)}
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
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      onClick={() => handleDelete(entry.id, entry.full_name)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
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
    </div>
  );
}
