'use client';

import { useState } from 'react';
import { WaitlistEntry } from '@/types/database';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Bell, Mail, Phone, User, Home, DollarSign, Calendar } from 'lucide-react';

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

interface SheetsMatchAlertsProps {
  units: SheetUnit[];
  waitlistEntries: WaitlistEntry[];
}

interface MatchedEntry extends WaitlistEntry {
  matchType: 'exact' | 'flexible';
  flexibilityNote?: string;
}

interface Match {
  unit: SheetUnit;
  entries: MatchedEntry[];
}

export function SheetsMatchAlerts({ units, waitlistEntries }: SheetsMatchAlertsProps) {
  const [sendingNotifications, setSendingNotifications] = useState<string[]>([]);

  const findMatches = (): Match[] => {
    const activeEntries = waitlistEntries.filter(e => e.status === 'Active');
    const matches: Match[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const unit of units) {
      // Helper function to check date match and return match type
      const checkDateMatch = (entry: WaitlistEntry): { matches: boolean; matchType: 'exact' | 'flexible'; flexibilityNote?: string } => {
        const entryMoveInStart = new Date(entry.move_in_date);
        entryMoveInStart.setHours(0, 0, 0, 0);
        const entryMoveInEnd = entry.move_in_date_end 
          ? new Date(entry.move_in_date_end) 
          : entryMoveInStart;
        entryMoveInEnd.setHours(0, 0, 0, 0);
        
        // Determine unit availability date
        let unitAvailable: Date;
        const isAvailableNow = !unit.available_date || 
          unit.available_date.toLowerCase() === 'now' || 
          unit.available_date.toLowerCase() === 'available';
        
        if (isAvailableNow) {
          unitAvailable = today;
        } else {
          unitAvailable = new Date(unit.available_date!);
          unitAvailable.setHours(0, 0, 0, 0);
        }
        
        // Calculate 1-month flexibility windows
        const oneMonthBeforeStart = new Date(entryMoveInStart);
        oneMonthBeforeStart.setDate(oneMonthBeforeStart.getDate() - 30);
        const oneMonthAfterEnd = new Date(entryMoveInEnd);
        oneMonthAfterEnd.setDate(oneMonthAfterEnd.getDate() + 30);
        
        // Check if unit is within the exact range
        const isExactMatch = unitAvailable >= entryMoveInStart && unitAvailable <= entryMoveInEnd;
        
        // Check if unit is within 1 month before the range
        const isBeforeRange = unitAvailable >= oneMonthBeforeStart && unitAvailable < entryMoveInStart;
        
        // Check if unit is within 1 month after the range
        const isAfterRange = unitAvailable > entryMoveInEnd && unitAvailable <= oneMonthAfterEnd;
        
        if (isExactMatch) {
          return { matches: true, matchType: 'exact' };
        } else if (isBeforeRange) {
          return { 
            matches: true, 
            matchType: 'flexible', 
            flexibilityNote: `Unit available before requested range` 
          };
        } else if (isAfterRange) {
          return { 
            matches: true, 
            matchType: 'flexible', 
            flexibilityNote: `Unit available after requested range` 
          };
        }
        
        return { matches: false, matchType: 'exact' };
      };

      const matchingEntries: MatchedEntry[] = activeEntries
        .filter(entry => {
          // ===== MANDATORY MATCHES =====
          
          // Match by property (required)
          if (entry.property !== unit.property) return false;
          
          // Match by unit type (required) - supports multiple unit types (comma-separated)
          const entryUnitTypes = entry.unit_type_pref.split(',').map(t => t.trim());
          if (!entryUnitTypes.includes(unit.unit_type)) return false;
          
          // Match by move-in date (required) - with 1 month flexibility
          const dateCheck = checkDateMatch(entry);
          if (!dateCheck.matches) return false;
          
          // ===== OPTIONAL MATCHES (only apply if specified) =====
          
          // Match by preferred unit numbers (optional - only filter if specified)
          if (entry.preferred_units && entry.preferred_units.trim() !== '') {
            const preferredList = entry.preferred_units.split(',').map(u => u.trim().toLowerCase());
            if (!preferredList.includes(unit.unit_number.toLowerCase())) return false;
          }
          
          // Match by max budget (optional - only filter if budget is set)
          if (entry.max_budget > 0 && unit.rent_price > entry.max_budget) return false;
          
          return true;
        })
        .map(entry => {
          const dateCheck = checkDateMatch(entry);
          return {
            ...entry,
            matchType: dateCheck.matchType,
            flexibilityNote: dateCheck.flexibilityNote,
          };
        });

      if (matchingEntries.length > 0) {
        // Sort: Internal Transfers first, then by created_at
        const sortedEntries = matchingEntries.sort((a, b) => {
          if (a.entry_type !== b.entry_type) {
            return a.entry_type === 'Internal Transfer' ? -1 : 1;
          }
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        });
        
        matches.push({ unit, entries: sortedEntries });
      }
    }

    return matches;
  };

  const handleSendNotification = async (unit: SheetUnit, entries: MatchedEntry[]) => {
    setSendingNotifications(prev => [...prev, unit.unique_id]);
    
    try {
      // Group entries by agent
      const entriesByAgent: Record<string, WaitlistEntry[]> = {};
      entries.forEach(e => {
        const agent = e.assigned_agent || 'Unassigned';
        if (!entriesByAgent[agent]) entriesByAgent[agent] = [];
        entriesByAgent[agent].push(e);
      });

      const results: string[] = [];
      
      for (const [agent, agentEntries] of Object.entries(entriesByAgent)) {
        if (agent === 'Unassigned') continue; // Skip unassigned entries
        
        const response = await fetch('/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            unit: {
              property: unit.property,
              unit_number: unit.unit_number,
              unit_type: unit.unit_type,
              rent_price: unit.rent_price,
              available_date: unit.available_date || new Date().toISOString(),
            },
            agent,
            contacts: agentEntries.map(e => ({
              name: e.full_name,
              email: e.email,
              phone: e.phone,
              entry_type: e.entry_type,
              budget: e.max_budget,
              move_in_date: e.move_in_date,
            })),
          }),
        });

        const result = await response.json();
        
        if (response.ok) {
          results.push(`✓ ${agent}: ${result.contactCount} contacts`);
        } else {
          results.push(`✗ ${agent}: ${result.error}`);
        }
      }

      if (results.length > 0) {
        alert(`Notifications sent:\n\n${results.join('\n')}`);
      } else {
        alert('No assigned agents found for these entries.');
      }
    } catch (error) {
      console.error('Error sending notifications:', error);
      alert('Failed to send notifications. Please try again.');
    } finally {
      setSendingNotifications(prev => prev.filter(id => id !== unit.unique_id));
    }
  };

  const matches = findMatches();
  const totalMatches = matches.reduce((sum, m) => sum + m.entries.length, 0);

  if (matches.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center text-muted-foreground">
          <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No matches found between available units and waitlist entries.</p>
          <p className="text-sm mt-2">Add waitlist entries that match the property, unit type, and budget of available units.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Bell className="h-5 w-5 text-orange-500" />
        <h3 className="text-lg font-semibold">
          Match Alerts ({totalMatches} {totalMatches === 1 ? 'match' : 'matches'} across {matches.length} units)
        </h3>
      </div>

      <div className="grid gap-4">
        {matches.map(({ unit, entries }) => (
          <Card key={unit.unique_id} className="border-orange-200 bg-orange-50/50">
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Home className="h-4 w-4" />
                    {unit.property} - Unit {unit.unit_number}
                  </CardTitle>
                  <div className="flex gap-4 text-sm text-muted-foreground mt-1">
                    <span>{unit.unit_type} / {unit.bathrooms}BA</span>
                    <span>{unit.sq_footage.toLocaleString()} sqft</span>
                    <span className="flex items-center gap-1">
                      <DollarSign className="h-3 w-3" />
                      {unit.rent_price.toLocaleString()}/mo
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {unit.available_date ? new Date(unit.available_date).toLocaleDateString() : 'Now'}
                    </span>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-medium mb-2">
                {entries.length} matching {entries.length === 1 ? 'person' : 'people'} on waitlist:
              </p>
              <div className="space-y-2">
                {entries.map((entry, idx) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between bg-white p-3 rounded-md border"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-muted-foreground w-6">#{idx + 1}</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4" />
                          <span className="font-medium">{entry.full_name}</span>
                          <Badge variant={entry.entry_type === 'Internal Transfer' ? 'default' : 'secondary'}>
                            {entry.entry_type === 'Internal Transfer' ? '🏠 Transfer' : '👤 Prospect'}
                          </Badge>
                        </div>
                        <div className="flex gap-4 text-sm text-muted-foreground mt-1">
                          {entry.email && (
                            <span className="flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {entry.email}
                            </span>
                          )}
                          {entry.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {entry.phone}
                            </span>
                          )}
                          <span>Budget: ${entry.max_budget > 0 ? entry.max_budget.toLocaleString() : 'Any'}</span>
                          <span>Agent: {entry.assigned_agent || 'Open'}</span>
                          {entry.matchType === 'flexible' && (
                            <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">
                              ⚠️ {entry.flexibilityNote}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
