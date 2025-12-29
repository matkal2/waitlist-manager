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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Search, Home, DollarSign, Calendar, Layers } from 'lucide-react';

interface UnitMatcherProps {
  entries: WaitlistEntry[];
}

interface UnitCriteria {
  unit_type: string;
  floor: string;
  price: number | null;
  available_date: string;
}

export function UnitMatcher({ entries }: UnitMatcherProps) {
  const [criteria, setCriteria] = useState<UnitCriteria>({
    unit_type: '',
    floor: '',
    price: null,
    available_date: '',
  });
  const [matchedEntries, setMatchedEntries] = useState<WaitlistEntry[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const findMatches = () => {
    if (!criteria.unit_type || !criteria.price) {
      alert('Please enter at least unit type and price');
      return;
    }

    const matches = entries
      .filter(entry => {
        // Only match active entries
        if (entry.status !== 'Active') return false;

        // Match unit type
        if (entry.unit_type_pref !== criteria.unit_type) return false;

        // Match budget (entry's max budget must be >= unit price)
        if (entry.max_budget < criteria.price!) return false;

        // Match floor preference if specified
        if (criteria.floor && criteria.floor !== 'Any') {
          if (entry.floor_pref !== 'No Preference' && entry.floor_pref !== criteria.floor) {
            return false;
          }
        }

        // Match move-in date if specified (entry wants to move in before or on available date)
        if (criteria.available_date && entry.move_in_date) {
          const availableDate = new Date(criteria.available_date);
          const moveInDate = new Date(entry.move_in_date);
          if (moveInDate < availableDate) return false;
        }

        return true;
      })
      // Sort by priority: Internal Transfers FIRST (Transfer First Rule)
      .sort((a, b) => {
        if (a.entry_type !== b.entry_type) {
          return a.entry_type === 'Internal Transfer' ? -1 : 1;
        }
        // Secondary sort by created_at (oldest first for fairness)
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });

    setMatchedEntries(matches);
    setHasSearched(true);
  };

  const clearSearch = () => {
    setCriteria({
      unit_type: '',
      floor: '',
      price: null,
      available_date: '',
    });
    setMatchedEntries([]);
    setHasSearched(false);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Unit Availability Matcher
          </CardTitle>
          <CardDescription>
            Enter details of an available unit to find matching waitlist entries.
            Internal Transfers are always prioritized over Prospects.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <Home className="h-4 w-4" /> Unit Type *
              </Label>
              <Select
                value={criteria.unit_type}
                onValueChange={(value) => setCriteria({ ...criteria, unit_type: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select unit type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Studio">Studio</SelectItem>
                  <SelectItem value="1BR">1BR</SelectItem>
                  <SelectItem value="2BR">2BR</SelectItem>
                  <SelectItem value="3BR">3BR</SelectItem>
                  <SelectItem value="4BR">4BR</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <Layers className="h-4 w-4" /> Floor Level
              </Label>
              <Select
                value={criteria.floor}
                onValueChange={(value) => setCriteria({ ...criteria, floor: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select floor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Any">Any Floor</SelectItem>
                  <SelectItem value="Ground">Ground</SelectItem>
                  <SelectItem value="Middle">Middle</SelectItem>
                  <SelectItem value="Top">Top</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <DollarSign className="h-4 w-4" /> Monthly Price *
              </Label>
              <Input
                type="number"
                placeholder="e.g., 2100"
                value={criteria.price || ''}
                onChange={(e) => setCriteria({ ...criteria, price: e.target.value ? Number(e.target.value) : null })}
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <Calendar className="h-4 w-4" /> Available Date
              </Label>
              <Input
                type="date"
                value={criteria.available_date}
                onChange={(e) => setCriteria({ ...criteria, available_date: e.target.value })}
              />
            </div>
          </div>

          <div className="flex gap-2 mt-6">
            <Button onClick={findMatches} className="flex-1 md:flex-none">
              <Search className="mr-2 h-4 w-4" />
              Find Matches
            </Button>
            <Button variant="outline" onClick={clearSearch}>
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {hasSearched && (
        <Card>
          <CardHeader>
            <CardTitle>
              Matching Entries ({matchedEntries.length})
            </CardTitle>
            <CardDescription>
              {matchedEntries.length > 0 
                ? 'Sorted by priority: Internal Transfers first, then by waitlist date'
                : 'No matching entries found for the specified criteria'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {matchedEntries.length > 0 ? (
              <div className="space-y-3">
                {matchedEntries.map((entry, index) => (
                  <div
                    key={entry.id}
                    className={`p-4 rounded-lg border ${
                      entry.entry_type === 'Internal Transfer'
                        ? 'border-blue-200 bg-blue-50 dark:bg-blue-950/20'
                        : 'border-gray-200 bg-gray-50 dark:bg-gray-900/20'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold">
                          {index + 1}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{entry.full_name}</span>
                            <Badge variant={entry.entry_type === 'Internal Transfer' ? 'default' : 'secondary'}>
                              {entry.entry_type === 'Internal Transfer' ? '🏠 Transfer' : '👤 Prospect'}
                            </Badge>
                            {entry.entry_type === 'Internal Transfer' && (
                              <Badge variant="outline" className="text-blue-600 border-blue-600">
                                PRIORITY
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground mt-1">
                            {entry.email} • {entry.phone}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">${entry.max_budget.toLocaleString()}/mo max</div>
                        <div className="text-sm text-muted-foreground">
                          Move-in: {new Date(entry.move_in_date).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-sm">
                      <Badge variant="outline">{entry.unit_type_pref}</Badge>
                      <Badge variant="outline">{entry.floor_pref}</Badge>
                      {entry.current_unit_number && (
                        <Badge variant="outline">Current: Unit {entry.current_unit_number}</Badge>
                      )}
                      {entry.assigned_agent ? (
                        <Badge variant="outline">Agent: {entry.assigned_agent}</Badge>
                      ) : (
                        <Badge variant="outline" className="text-orange-600 border-orange-600">
                          Open Lead
                        </Badge>
                      )}
                    </div>
                    {entry.internal_notes && (
                      <div className="mt-2 text-sm text-muted-foreground italic">
                        Notes: {entry.internal_notes}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No matching entries found</p>
                <p className="text-sm mt-1">Try adjusting your search criteria</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
