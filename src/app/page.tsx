'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/auth-provider';
import { WaitlistEntry } from '@/types/database';
import { AddEntryForm } from '@/components/add-entry-form';
import { WaitlistTable } from '@/components/waitlist-table';
import { SheetsUnits } from '@/components/sheets-units';
import { SheetsMatchAlerts } from '@/components/sheets-match-alerts';
import { ActivityLogView } from '@/components/activity-log';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Building2, Users, Clock, Home as HomeIcon, Bell, LogOut, History, User, Key, Shield } from 'lucide-react';

const ADMIN_EMAIL = 'mkaleb@hpvgproperties.com';

// Map user emails to full names
const EMAIL_TO_NAME: Record<string, string> = {
  'mkaleb@hpvgproperties.com': 'Matthew Kaleb',
  'mdillon@hpvgproperties.com': 'Michael Dillon',
  'matthew.kaleb1763@gmail.com': 'Matthew Kaleb',
};

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

export default function Home() {
  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [sheetUnits, setSheetUnits] = useState<SheetUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userFullName, setUserFullName] = useState<string | null>(null);

  const fetchEntries = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('waitlist_entries')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setEntries(data as WaitlistEntry[] || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching entries:', err);
      setError('Failed to load entries. Please check your Supabase connection.');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSheetUnitsLoaded = useCallback((units: SheetUnit[]) => {
    setSheetUnits(units);
  }, []);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) {
      fetchEntries();
      
      // Fetch user's full name from user_profiles or user metadata
      const fetchUserName = async () => {
        // First try user metadata (set during registration)
        if (user.user_metadata?.full_name) {
          setUserFullName(user.user_metadata.full_name);
          return;
        }
        
        // Then try EMAIL_TO_NAME map for known users
        if (user.email && EMAIL_TO_NAME[user.email]) {
          setUserFullName(EMAIL_TO_NAME[user.email]);
          return;
        }
        
        // Finally try user_profiles table
        if (user.email) {
          const { data } = await supabase
            .from('user_profiles')
            .select('full_name')
            .eq('email', user.email)
            .single();
          
          if (data?.full_name) {
            setUserFullName(data.full_name);
            return;
          }
        }
        
        // Fallback to email prefix
        setUserFullName(user.email?.split('@')[0] || 'User');
      };
      
      fetchUserName();
    }
  }, [fetchEntries, user]);

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Don't render if not authenticated
  if (!user) {
    return null;
  }

  const stats = {
    total: entries.length,
    transfers: entries.filter(e => e.entry_type === 'Internal Transfer').length,
    prospects: entries.filter(e => e.entry_type === 'Prospect').length,
    active: entries.filter(e => e.status === 'Active').length,
    availableUnits: sheetUnits.length,
  };

  // Calculate matches for the alert badge (must match property, unit type, AND move-in date)
  const matchCount = sheetUnits.reduce((count: number, unit: SheetUnit) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const matches = entries.filter(e => {
      if (e.status !== 'Active') return false;
      if (e.property !== unit.property) return false;
      if (e.unit_type_pref !== unit.unit_type) return false;
      
      // Check move-in date matching
      const entryMoveInStart = new Date(e.move_in_date);
      entryMoveInStart.setHours(0, 0, 0, 0);
      const entryMoveInEnd = e.move_in_date_end 
        ? new Date(e.move_in_date_end) 
        : entryMoveInStart;
      entryMoveInEnd.setHours(0, 0, 0, 0);
      
      const isAvailableNow = !unit.available_date || 
        unit.available_date.toLowerCase() === 'now' || 
        unit.available_date.toLowerCase() === 'available';
      
      if (isAvailableNow) {
        // For units available "Now", only match entries wanting to move in within 30 days
        const thirtyDaysFromNow = new Date(today);
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
        if (entryMoveInStart > thirtyDaysFromNow) return false;
        if (entryMoveInEnd < today) return false;
      } else {
        const unitAvailable = new Date(unit.available_date!);
        unitAvailable.setHours(0, 0, 0, 0);
        if (e.move_in_date_end) {
          if (unitAvailable > entryMoveInEnd) return false;
        } else {
          if (unitAvailable > entryMoveInStart) return false;
        }
      }
      
      // Budget is optional
      if (e.max_budget > 0 && unit.rent_price > e.max_budget) return false;
      
      return true;
    });
    return count + (matches.length > 0 ? 1 : 0);
  }, 0);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Building2 className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Waitlist Manager
                </h1>
                <p className="text-sm text-muted-foreground">
                  Property Management Transfer & Prospect System
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <AddEntryForm onEntryAdded={fetchEntries} />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <User className="h-4 w-4 mr-2" />
                    {userFullName || 'Account'}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>My Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => router.push('/settings')}>
                    <Key className="h-4 w-4 mr-2" />
                    Change Password
                  </DropdownMenuItem>
                  {(user?.email === ADMIN_EMAIL || user?.email === 'matthew.kaleb1763@gmail.com') && (
                    <DropdownMenuItem onClick={() => router.push('/admin')}>
                      <Shield className="h-4 w-4 mr-2" />
                      Admin Panel
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut}>
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            <p className="font-medium">Connection Error</p>
            <p className="text-sm">{error}</p>
            <p className="text-sm mt-2">
              Make sure your <code className="bg-red-100 px-1 rounded">.env.local</code> file contains valid Supabase credentials.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Entries</CardDescription>
              <CardTitle className="text-3xl flex items-center gap-2">
                <Users className="h-6 w-6 text-muted-foreground" />
                {stats.total}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Internal Transfers</CardDescription>
              <CardTitle className="text-3xl flex items-center gap-2">
                <Badge variant="default" className="text-lg px-2 py-1">🏠 {stats.transfers}</Badge>
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Prospects</CardDescription>
              <CardTitle className="text-3xl flex items-center gap-2">
                <Badge variant="secondary" className="text-lg px-2 py-1">👤 {stats.prospects}</Badge>
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Active Leads</CardDescription>
              <CardTitle className="text-3xl flex items-center gap-2">
                <Clock className="h-6 w-6 text-green-500" />
                {stats.active}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Tabs defaultValue="dashboard" className="space-y-4">
          <TabsList>
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="units">
              <span className="flex items-center gap-2">
                <HomeIcon className="h-4 w-4" />
                Available Units
                {stats.availableUnits > 0 && (
                  <Badge variant="secondary" className="ml-1">{stats.availableUnits}</Badge>
                )}
              </span>
            </TabsTrigger>
            <TabsTrigger value="alerts">
              <span className="flex items-center gap-2">
                <Bell className="h-4 w-4" />
                Match Alerts
                {matchCount > 0 && (
                  <Badge variant="destructive" className="ml-1 animate-pulse">{matchCount}</Badge>
                )}
              </span>
            </TabsTrigger>
            <TabsTrigger value="activity">
              <span className="flex items-center gap-2">
                <History className="h-4 w-4" />
                Activity Log
              </span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard">
            <Card>
              <CardHeader>
                <CardTitle>Waitlist Entries</CardTitle>
                <CardDescription>
                  All leads sorted by priority. Internal Transfers always rank higher than Prospects.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    <span className="ml-3 text-muted-foreground">Loading entries...</span>
                  </div>
                ) : (
                  <WaitlistTable entries={entries} onRefresh={fetchEntries} currentUserEmail={user?.email} />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="units">
            <Card>
              <CardHeader>
                <CardTitle>Available Units (Google Sheets)</CardTitle>
                <CardDescription>
                  Live data from your Google Sheets spreadsheet. Updates automatically.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SheetsUnits onUnitsLoaded={handleSheetUnitsLoaded} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="alerts">
            <Card>
              <CardHeader>
                <CardTitle>Match Alerts</CardTitle>
                <CardDescription>
                  Units with matching waitlist entries. Internal Transfers are prioritized.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SheetsMatchAlerts 
                  units={sheetUnits} 
                  waitlistEntries={entries}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activity">
            <Card>
              <CardHeader>
                <CardTitle>Activity Log</CardTitle>
                <CardDescription>
                  View and revert changes made to waitlist entries in the last 6 months.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ActivityLogView onRevert={fetchEntries} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <footer className="mt-8 py-4 border-t bg-white dark:bg-gray-800">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm text-muted-foreground">
          Property Management Waitlist System • Transfers First Priority
        </div>
      </footer>
    </div>
  );
}
