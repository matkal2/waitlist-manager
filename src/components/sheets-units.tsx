'use client';

import { useState, useEffect, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RefreshCw, Home, ExternalLink } from 'lucide-react';

interface SheetUnit {
  property: string;
  unit_number: string;
  unit_type: string;
  bedrooms: number;
  bathrooms: number;
  sq_footage: number;
  available_date: string | null;
  rent_price: number;
  status: string;
  address: string;
  unique_id: string;
}

interface SheetsUnitsProps {
  onUnitsLoaded: (units: SheetUnit[]) => void;
}

export function SheetsUnits({ onUnitsLoaded }: SheetsUnitsProps) {
  const [units, setUnits] = useState<SheetUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [propertyFilter, setPropertyFilter] = useState<string>('all');

  const fetchUnits = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/sync-sheets');
      const data = await response.json();
      
      if (data.success) {
        setUnits(data.units);
        setLastUpdated(data.lastUpdated);
        onUnitsLoaded(data.units);
        
        // Auto-check for matches and send notifications
        try {
          const notifyResponse = await fetch('/api/auto-notify');
          const notifyData = await notifyResponse.json();
          if (notifyData.notificationsSent > 0) {
            console.log(`Auto-notifications sent: ${notifyData.notificationsSent}`);
          }
        } catch (notifyError) {
          console.error('Auto-notify check failed:', notifyError);
        }
        
        // Auto-cleanup expired prospects (2+ months past move-in date)
        try {
          const cleanupResponse = await fetch('/api/cleanup');
          const cleanupData = await cleanupResponse.json();
          if (cleanupData.deleted > 0) {
            console.log(`Auto-cleanup: ${cleanupData.deleted} expired entries deleted`);
          }
        } catch (cleanupError) {
          console.error('Auto-cleanup failed:', cleanupError);
        }
      }
    } catch (error) {
      console.error('Error fetching units:', error);
    } finally {
      setLoading(false);
    }
  }, [onUnitsLoaded]);

  useEffect(() => {
    fetchUnits();
    // Auto-refresh every 5 minutes
    const interval = setInterval(fetchUnits, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchUnits]);

  const uniqueProperties = [...new Set(units.map(u => u.property))].sort();

  const filteredUnits = propertyFilter === 'all' 
    ? units 
    : units.filter(u => u.property === propertyFilter);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Home className="h-5 w-5" />
          <h3 className="text-lg font-semibold">
            Available Units from Google Sheets ({units.length})
          </h3>
        </div>
        <div className="flex items-center gap-4">
          {lastUpdated && (
            <span className="text-sm text-muted-foreground">
              Last synced: {new Date(lastUpdated).toLocaleTimeString()}
            </span>
          )}
          <Button 
            size="sm" 
            variant="outline" 
            onClick={fetchUnits}
            disabled={loading}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <a 
            href="https://docs.google.com/spreadsheets/d/1OTm2nalt3DUBPzM_kQ4ZmiO0cs0dLUC2o72DYgoRA0U/edit"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button size="sm" variant="outline">
              <ExternalLink className="mr-2 h-4 w-4" />
              Open Sheet
            </Button>
          </a>
        </div>
      </div>

      <div className="flex gap-4">
        <Select value={propertyFilter} onValueChange={setPropertyFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter by property" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Properties ({units.length})</SelectItem>
            {uniqueProperties.map(property => {
              const count = units.filter(u => u.property === property).length;
              return (
                <SelectItem key={property} value={property}>
                  {property} ({count})
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      {loading && units.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <span className="ml-3 text-muted-foreground">Loading from Google Sheets...</span>
        </div>
      ) : units.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground border rounded-md">
          No available units found in the spreadsheet.
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Property</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Sq Ft</TableHead>
                <TableHead>Rent</TableHead>
                <TableHead>Available</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUnits.map((unit) => (
                <TableRow key={unit.unique_id}>
                  <TableCell className="font-medium">{unit.property}</TableCell>
                  <TableCell>{unit.unit_number}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {unit.unit_type} / {unit.bathrooms}BA
                    </Badge>
                  </TableCell>
                  <TableCell>{unit.sq_footage.toLocaleString()} sqft</TableCell>
                  <TableCell className="font-semibold">
                    ${unit.rent_price.toLocaleString()}/mo
                  </TableCell>
                  <TableCell>
                    {!unit.available_date || unit.available_date.toLowerCase() === 'now'
                      ? 'Now'
                      : (() => {
                          // Parse YYYY-MM-DD as local date to avoid timezone shift
                          const parts = unit.available_date.split('-');
                          if (parts.length === 3) {
                            const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                            return date.toLocaleDateString();
                          }
                          return unit.available_date;
                        })()
                    }
                  </TableCell>
                  <TableCell>
                    <Badge variant="default" className="bg-green-600">
                      {unit.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
