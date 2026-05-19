'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle, AlertTriangle, ArrowRight, User, Home, Car } from 'lucide-react';

interface ReservationMatch {
  reservation_id: string;
  applicant_name: string;
  unit_number: string;
  property: string;
  spot_number: string;
  full_space_code: string;
  matched_tenant_code: string;
  matched_tenant_name: string;
}

interface ParkingReservationMatchesProps {
  onConvertSuccess: () => void;
}

export function ParkingReservationMatches({ onConvertSuccess }: ParkingReservationMatchesProps) {
  const [matches, setMatches] = useState<ReservationMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [converting, setConverting] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<ReservationMatch | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checkMatches = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/parking/reservations/check-matches');
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to check matches');
      }
      
      setMatches(data.matches || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check matches');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkMatches();
  }, []);

  const handleConvert = async (match: ReservationMatch) => {
    setConverting(match.reservation_id);
    setError(null);
    
    try {
      // Update reservation status to converted
      const response = await fetch('/api/parking/reservations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: match.reservation_id,
          status: 'converted',
          converted_tenant_code: match.matched_tenant_code,
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to convert reservation');
      }
      
      // Submit parking change to OUTPUT sheet
      const changeResponse = await fetch('/api/parking/changes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'Add',
          tenant_name: match.matched_tenant_name,
          tenant_code: match.matched_tenant_code,
          tenant_unit: match.unit_number,
          effective_date: new Date().toISOString().split('T')[0],
          primary_space: match.full_space_code,
          submitter: 'Reservation Conversion',
          other_notes: `Converted from reservation for ${match.applicant_name}`,
        }),
      });
      
      if (!changeResponse.ok) {
        const changeData = await changeResponse.json();
        console.warn('Warning: Reservation converted but change request may have failed:', changeData.error);
      }
      
      // Remove from matches list
      setMatches(prev => prev.filter(m => m.reservation_id !== match.reservation_id));
      setShowDialog(false);
      setSelectedMatch(null);
      onConvertSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to convert reservation');
    } finally {
      setConverting(null);
    }
  };

  const handleCancelReservation = async (reservationId: string) => {
    setConverting(reservationId);
    setError(null);
    
    try {
      const response = await fetch(`/api/parking/reservations?id=${reservationId}`, {
        method: 'DELETE',
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to cancel reservation');
      }
      
      setMatches(prev => prev.filter(m => m.reservation_id !== reservationId));
      setShowDialog(false);
      setSelectedMatch(null);
      onConvertSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel reservation');
    } finally {
      setConverting(null);
    }
  };

  if (matches.length === 0 && !loading) {
    return null;
  }

  return (
    <>
      {matches.length > 0 && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <span className="font-semibold text-green-800">Reservation Matches Found</span>
          </div>
          <div className="text-green-700">
            <div className="mt-2 space-y-2">
              {matches.map((match) => (
                <div key={match.reservation_id} className="flex items-center justify-between bg-white rounded-md p-3 border border-green-200">
                  <div className="flex items-center gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-gray-500" />
                        <span className="font-medium">{match.applicant_name}</span>
                        <ArrowRight className="h-4 w-4 text-green-600" />
                        <span className="font-medium text-green-700">{match.matched_tenant_name}</span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                        <span className="flex items-center gap-1">
                          <Home className="h-3 w-3" />
                          Unit {match.unit_number}
                        </span>
                        <span className="flex items-center gap-1">
                          <Car className="h-3 w-3" />
                          {match.full_space_code}
                        </span>
                        <Badge variant="outline" className="text-xs">{match.property}</Badge>
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700"
                    onClick={() => {
                      setSelectedMatch(match);
                      setShowDialog(true);
                    }}
                  >
                    Convert to Assignment
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Convert Reservation to Assignment
            </DialogTitle>
            <DialogDescription>
              The applicant has signed their lease and is now in the Directory.
              Convert this reservation to an official parking assignment.
            </DialogDescription>
          </DialogHeader>

          {selectedMatch && (
            <Card className="bg-gray-50">
              <CardContent className="pt-4">
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Applicant</span>
                    <span className="font-medium">{selectedMatch.applicant_name}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-500">Matched Tenant</span>
                    <div className="text-right">
                      <span className="font-medium text-green-700">{selectedMatch.matched_tenant_name}</span>
                      <span className="text-xs text-gray-500 block">{selectedMatch.matched_tenant_code}</span>
                    </div>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Unit</span>
                    <span className="font-medium">{selectedMatch.unit_number}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Parking Spot</span>
                    <span className="font-medium">{selectedMatch.full_space_code}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          )}

          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => selectedMatch && handleCancelReservation(selectedMatch.reservation_id)}
              disabled={converting !== null}
              className="text-red-600 border-red-300 hover:bg-red-50"
            >
              Cancel Reservation
            </Button>
            <Button
              onClick={() => selectedMatch && handleConvert(selectedMatch)}
              disabled={converting !== null}
              className="bg-green-600 hover:bg-green-700"
            >
              {converting ? 'Converting...' : 'Confirm & Assign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
