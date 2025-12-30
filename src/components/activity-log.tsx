'use client';

import { useState, useEffect } from 'react';
import { ActivityLog, WaitlistEntry } from '@/types/database';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
import { History, RotateCcw, Search, Trash2, Pencil, Plus, ChevronDown, ChevronUp } from 'lucide-react';

interface ActivityLogProps {
  onRevert?: () => void;
}

export function ActivityLogView({ onRevert }: ActivityLogProps) {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [reverting, setReverting] = useState<string | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      // Get logs from last 6 months
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const { data, error } = await supabase
        .from('activity_log')
        .select('*')
        .gte('created_at', sixMonthsAgo.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      console.error('Error fetching activity logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRevert = async (log: ActivityLog) => {
    if (!confirm(`Are you sure you want to revert this ${log.action_type}? This will restore the entry to its previous state.`)) {
      return;
    }

    setReverting(log.id);
    try {
      if (log.action_type === 'delete') {
        // Restore deleted entry
        const entryData = log.entry_data;
        const { id, created_at, ...insertData } = entryData;
        
        const { error } = await supabase
          .from('waitlist_entries')
          .insert(insertData);

        if (error) throw error;
        alert('Entry restored successfully!');
      } else if (log.action_type === 'edit' && log.entry_id) {
        // Revert edit - restore previous values
        const entryData = log.entry_data;
        const { id, created_at, ...updateData } = entryData;

        const { error } = await supabase
          .from('waitlist_entries')
          .update(updateData)
          .eq('id', log.entry_id);

        if (error) throw error;
        alert('Entry reverted to previous state!');
      }

      // Log the revert action
      await supabase.from('activity_log').insert({
        action_type: 'edit',
        entry_id: log.entry_id,
        entry_data: log.entry_data,
        changed_by: 'System (Revert)',
        changes: { reverted_from: { old: log.id, new: 'reverted' } },
      });

      fetchLogs();
      onRevert?.();
    } catch (error) {
      console.error('Error reverting:', error);
      alert('Failed to revert. Please try again.');
    } finally {
      setReverting(null);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filteredLogs = logs.filter(log => {
    const entryName = log.entry_data?.full_name?.toLowerCase() || '';
    const actionType = log.action_type.toLowerCase();
    const changedBy = log.changed_by?.toLowerCase() || '';
    const search = searchTerm.toLowerCase();
    
    return entryName.includes(search) || actionType.includes(search) || changedBy.includes(search);
  });

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'create': return <Plus className="h-4 w-4 text-green-500" />;
      case 'edit': return <Pencil className="h-4 w-4 text-blue-500" />;
      case 'delete': return <Trash2 className="h-4 w-4 text-red-500" />;
      default: return null;
    }
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'create': return <Badge className="bg-green-100 text-green-800">Created</Badge>;
      case 'edit': return <Badge className="bg-blue-100 text-blue-800">Edited</Badge>;
      case 'delete': return <Badge className="bg-red-100 text-red-800">Deleted</Badge>;
      default: return <Badge>{action}</Badge>;
    }
  };

  const formatChanges = (changes: Record<string, { old: unknown; new: unknown }> | null) => {
    if (!changes) return null;
    
    return Object.entries(changes).map(([field, { old: oldVal, new: newVal }]) => (
      <div key={field} className="text-sm">
        <span className="font-medium">{field}:</span>{' '}
        <span className="text-red-500 line-through">{String(oldVal || 'empty')}</span>
        {' → '}
        <span className="text-green-500">{String(newVal || 'empty')}</span>
      </div>
    ));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <span className="ml-3 text-muted-foreground">Loading activity log...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5" />
          <h3 className="text-lg font-semibold">Activity Log</h3>
          <Badge variant="outline">{filteredLogs.length} entries</Badge>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, action..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Showing activity from the last 6 months. Older logs are automatically deleted.
      </p>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12"></TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entry Name</TableHead>
              <TableHead>Changed By</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLogs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No activity logs found
                </TableCell>
              </TableRow>
            ) : (
              filteredLogs.map((log) => {
                const isExpanded = expandedLog === log.id;
                return (
                  <>
                    <TableRow 
                      key={log.id} 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setExpandedLog(isExpanded ? null : log.id)}
                    >
                      <TableCell>
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getActionIcon(log.action_type)}
                          {getActionBadge(log.action_type)}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                        {log.entry_data?.full_name || 'Unknown'}
                      </TableCell>
                      <TableCell>
                        {log.changed_by || 'System'}
                      </TableCell>
                      <TableCell>
                        {new Date(log.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {(log.action_type === 'delete' || log.action_type === 'edit') && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRevert(log)}
                            disabled={reverting === log.id}
                          >
                            <RotateCcw className="h-4 w-4 mr-1" />
                            {reverting === log.id ? 'Reverting...' : 'Revert'}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow key={`${log.id}-expanded`} className="bg-muted/30">
                        <TableCell colSpan={6} className="p-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <h4 className="font-semibold text-sm mb-2">Entry Details at Time of Action</h4>
                              <div className="text-sm space-y-1 bg-white dark:bg-gray-800 p-3 rounded border">
                                <p><span className="text-muted-foreground">Property:</span> {log.entry_data?.property}</p>
                                <p><span className="text-muted-foreground">Unit Type:</span> {log.entry_data?.unit_type_pref}</p>
                                <p><span className="text-muted-foreground">Move-in:</span> {log.entry_data?.move_in_date}</p>
                                <p><span className="text-muted-foreground">Budget:</span> ${log.entry_data?.max_budget?.toLocaleString()}</p>
                                <p><span className="text-muted-foreground">Agent:</span> {log.entry_data?.assigned_agent || 'Open'}</p>
                                <p><span className="text-muted-foreground">Status:</span> {log.entry_data?.status}</p>
                              </div>
                            </div>
                            {log.changes && Object.keys(log.changes).length > 0 && (
                              <div>
                                <h4 className="font-semibold text-sm mb-2">Changes Made</h4>
                                <div className="bg-white dark:bg-gray-800 p-3 rounded border space-y-1">
                                  {formatChanges(log.changes)}
                                </div>
                              </div>
                            )}
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
    </div>
  );
}
