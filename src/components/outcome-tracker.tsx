'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { 
  ChevronDown, 
  Target, 
  Calendar, 
  FileText, 
  CheckCircle, 
  XCircle,
  Trash2,
  RotateCcw
} from 'lucide-react';
import type { OutcomeStatus } from '@/types/database';

interface OutcomeTrackerProps {
  entryId: string;
  currentStatus: OutcomeStatus | null;
  onUpdate: () => void;
}

const OUTCOME_CONFIG: Record<string, { 
  label: string; 
  icon: React.ReactNode; 
  color: string;
  field: string | null;
}> = {
  active: { 
    label: 'Active', 
    icon: <RotateCcw className="h-3 w-3" />, 
    color: 'bg-blue-100 text-blue-700 border-blue-300',
    field: null
  },
  matched: { 
    label: 'Matched', 
    icon: <Target className="h-3 w-3" />, 
    color: 'bg-amber-100 text-amber-700 border-amber-300',
    field: 'matched_at'
  },
  touring: { 
    label: 'Tour Scheduled', 
    icon: <Calendar className="h-3 w-3" />, 
    color: 'bg-cyan-100 text-cyan-700 border-cyan-300',
    field: 'tour_scheduled_at'
  },
  applied: { 
    label: 'Applied', 
    icon: <FileText className="h-3 w-3" />, 
    color: 'bg-orange-100 text-orange-700 border-orange-300',
    field: 'applied_at'
  },
  leased: { 
    label: 'Lease Signed', 
    icon: <CheckCircle className="h-3 w-3" />, 
    color: 'bg-emerald-100 text-emerald-700 border-emerald-300',
    field: 'lease_signed_at'
  },
  declined: { 
    label: 'Declined', 
    icon: <XCircle className="h-3 w-3" />, 
    color: 'bg-red-100 text-red-700 border-red-300',
    field: null
  },
  removed: { 
    label: 'Removed', 
    icon: <Trash2 className="h-3 w-3" />, 
    color: 'bg-gray-100 text-gray-700 border-gray-300',
    field: null
  },
};

export function OutcomeTracker({ entryId, currentStatus, onUpdate }: OutcomeTrackerProps) {
  const [loading, setLoading] = useState(false);
  const [showNotesDialog, setShowNotesDialog] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<OutcomeStatus | null>(null);
  const [notes, setNotes] = useState('');

  const effectiveStatus = currentStatus || 'active';
  const config = OUTCOME_CONFIG[effectiveStatus];

  const handleStatusChange = async (newStatus: OutcomeStatus) => {
    // For decline/remove, prompt for notes
    if (newStatus === 'declined' || newStatus === 'removed') {
      setPendingStatus(newStatus);
      setShowNotesDialog(true);
      return;
    }

    await updateStatus(newStatus);
  };

  const updateStatus = async (newStatus: OutcomeStatus, outcomeNotes?: string) => {
    setLoading(true);
    try {
      const statusConfig = OUTCOME_CONFIG[newStatus];
      const updates: Record<string, any> = {
        outcome_status: newStatus,
      };

      // Set timestamp for the new status
      if (statusConfig.field) {
        updates[statusConfig.field] = new Date().toISOString();
      }

      // Add notes if provided
      if (outcomeNotes) {
        updates.outcome_notes = outcomeNotes;
      }

      const { error } = await supabase
        .from('waitlist_entries')
        .update(updates)
        .eq('id', entryId);

      if (error) throw error;

      onUpdate();
    } catch (error) {
      console.error('Error updating outcome:', error);
      alert('Failed to update status');
    } finally {
      setLoading(false);
      setShowNotesDialog(false);
      setPendingStatus(null);
      setNotes('');
    }
  };

  const handleConfirmWithNotes = () => {
    if (pendingStatus) {
      updateStatus(pendingStatus, notes);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="outline" 
            size="sm" 
            className={`h-7 px-2 text-xs ${config.color}`}
            disabled={loading}
          >
            {config.icon}
            <span className="ml-1">{config.label}</span>
            <ChevronDown className="h-3 w-3 ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem 
            onClick={() => handleStatusChange('active')}
            disabled={effectiveStatus === 'active'}
          >
            <RotateCcw className="h-4 w-4 mr-2 text-blue-600" />
            Active
          </DropdownMenuItem>
          <DropdownMenuItem 
            onClick={() => handleStatusChange('matched')}
            disabled={effectiveStatus === 'matched'}
          >
            <Target className="h-4 w-4 mr-2 text-amber-600" />
            Matched
          </DropdownMenuItem>
          <DropdownMenuItem 
            onClick={() => handleStatusChange('touring')}
            disabled={effectiveStatus === 'touring'}
          >
            <Calendar className="h-4 w-4 mr-2 text-cyan-600" />
            Tour Scheduled
          </DropdownMenuItem>
          <DropdownMenuItem 
            onClick={() => handleStatusChange('applied')}
            disabled={effectiveStatus === 'applied'}
          >
            <FileText className="h-4 w-4 mr-2 text-orange-600" />
            Applied
          </DropdownMenuItem>
          <DropdownMenuItem 
            onClick={() => handleStatusChange('leased')}
            disabled={effectiveStatus === 'leased'}
          >
            <CheckCircle className="h-4 w-4 mr-2 text-emerald-600" />
            Lease Signed
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem 
            onClick={() => handleStatusChange('declined')}
            disabled={effectiveStatus === 'declined'}
            className="text-red-600"
          >
            <XCircle className="h-4 w-4 mr-2" />
            Declined
          </DropdownMenuItem>
          <DropdownMenuItem 
            onClick={() => handleStatusChange('removed')}
            disabled={effectiveStatus === 'removed'}
            className="text-gray-600"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Removed
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showNotesDialog} onOpenChange={setShowNotesDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingStatus === 'declined' ? 'Decline Entry' : 'Remove Entry'}
            </DialogTitle>
            <DialogDescription>
              Add a note explaining why this entry is being {pendingStatus === 'declined' ? 'declined' : 'removed'}.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Enter reason (optional)..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNotesDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleConfirmWithNotes}
              variant={pendingStatus === 'declined' ? 'destructive' : 'default'}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function OutcomeBadge({ status }: { status: OutcomeStatus | null }) {
  const effectiveStatus = status || 'active';
  const config = OUTCOME_CONFIG[effectiveStatus];
  
  return (
    <Badge variant="outline" className={`text-xs ${config.color}`}>
      {config.icon}
      <span className="ml-1">{config.label}</span>
    </Badge>
  );
}

export function EntrySourceBadge({ source }: { source: 'self' | 'agent' | null }) {
  if (source === 'self') {
    return (
      <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-300">
        Self
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-300">
      Agent
    </Badge>
  );
}
