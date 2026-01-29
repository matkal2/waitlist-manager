'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/auth-provider';
import { ParkingWaitlist } from '@/types/database';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Car, ArrowLeft, User, Key, Shield, LogOut, ParkingCircle, CheckCircle, AlertTriangle, History, Users, Search, Zap, Accessibility, RefreshCw, Download, FileText, Calendar, Undo2, BarChart3, TrendingUp, Target, Building2 } from 'lucide-react';
import { ParkingChangeForm } from '@/components/parking-change-form';
import { ParkingWaitlistTable } from '@/components/parking-waitlist-table';
import { exportParkingToPDF } from '@/lib/pdf-export';

interface ParkingSpot {
  id: string;
  property: string;
  spot_type: string;
  spot_number: string;
  full_space_code: string;
  monthly_rent: number;
  status: 'Occupied' | 'Vacant' | 'Notice' | 'Reserved' | 'Future';
  tenant_code: string | null;
  tenant_name: string | null;
  unit_number: string | null;
  lease_start_date: string | null;
  termination_date: string | null;
  available_date: string | null;
  has_ev_charging: boolean;
  is_handicap: boolean;
  space_size: string | null;
  // Future tenant info
  future_tenant_code: string | null;
  future_tenant_name: string | null;
  future_unit_number: string | null;
  future_start_date: string | null;
  has_future_tenant: boolean;
}

interface ParkingChange {
  id: string;
  type: string;
  tenant_name: string;
  tenant_unit: string;
  effective_date: string;
  primary_space: string;
  transfer_to_space: string | null;
  submitter: string;
  other_notes: string | null;
  submission_date: string;
  synced_to_sheet: boolean;
  reverted: boolean;
  reverted_at: string | null;
  reverted_by: string | null;
  sheet_row_number: number | null;
}

const ADMIN_EMAIL = 'mkaleb@hpvgproperties.com';

const EMAIL_TO_NAME: Record<string, string> = {
  'mkaleb@hpvgproperties.com': 'Matthew Kaleb',
  'mdillon@hpvgproperties.com': 'Michael Dillon',
  'matthew.kaleb1763@gmail.com': 'Matthew Kaleb',
};

export default function ParkingPage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();
  const [spots, setSpots] = useState<ParkingSpot[]>([]);
  const [properties, setProperties] = useState<string[]>([]);
  const [waitlist, setWaitlist] = useState<ParkingWaitlist[]>([]);
  const [activityLog, setActivityLog] = useState<ParkingChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [userFullName, setUserFullName] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [activityFilter, setActivityFilter] = useState<string>('all');
  const [activityDateFrom, setActivityDateFrom] = useState<string>('');
  const [activityDateTo, setActivityDateTo] = useState<string>('');
  const [activitySearch, setActivitySearch] = useState<string>('');
  
  // Filters
  const [propertyFilter, setPropertyFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Historical trends
  const [snapshotsCaptured, setSnapshotsCaptured] = useState(false);
  const [historicalData, setHistoricalData] = useState<Array<{
    snapshot_date: string;
    property: string;
    total_spots: number;
    occupied_spots: number;
    vacant_spots: number;
    occupancy_rate: number;
    waitlist_total: number;
  }>>([]);
  const [trendLoading, setTrendLoading] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch parking data from Google Sheet API
      const parkingRes = await fetch('/api/parking');
      const parkingData = await parkingRes.json();
      
      if (parkingData.success) {
        setSpots(parkingData.spots || []);
        setProperties(parkingData.properties || []);
        setLastUpdated(parkingData.lastUpdated);
      }
      
      // Fetch waitlist from Supabase
      const waitlistRes = await supabase.from('parking_waitlist').select('*').order('created_at', { ascending: true });
      if (waitlistRes.data) setWaitlist(waitlistRes.data as ParkingWaitlist[]);
      
      // Fetch activity log from parking_changes
      const activityRes = await fetch('/api/parking/change');
      const activityData = await activityRes.json();
      if (activityData.success) {
        setActivityLog(activityData.changes || []);
      }
    } catch (err) {
      console.error('Error fetching parking data:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchHistoricalData = async (property?: string) => {
    setTrendLoading(true);
    try {
      const params = new URLSearchParams({ days: '30' });
      if (property && property !== 'all') {
        params.set('property', property);
      }
      const response = await fetch(`/api/parking/snapshot?${params}`);
      const data = await response.json();
      if (data.success) {
        // Use portfolio trend if viewing all properties, otherwise use property-specific data
        if (!property || property === 'all') {
          setHistoricalData(data.portfolioTrend || []);
        } else {
          setHistoricalData(data.snapshots || []);
        }
      }
    } catch (error) {
      console.error('Error fetching historical data:', error);
    } finally {
      setTrendLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) {
      fetchData();
      
      const fetchUserName = async () => {
        if (user.user_metadata?.full_name) {
          setUserFullName(user.user_metadata.full_name);
          return;
        }
        if (user.email && EMAIL_TO_NAME[user.email]) {
          setUserFullName(EMAIL_TO_NAME[user.email]);
          return;
        }
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
        setUserFullName(user.email?.split('@')[0] || 'User');
      };
      fetchUserName();
    }
  }, [user]);

  // Capture daily snapshot on page load (once per day)
  useEffect(() => {
    if (!snapshotsCaptured && spots.length > 0 && properties.length > 0 && !loading) {
      const captureSnapshot = async () => {
        try {
          // Build snapshot data for each property
          const snapshots = properties.map(prop => {
            const propSpots = spots.filter(s => s.property === prop);
            const propWaitlist = waitlist.filter(w => w.property === prop && w.status === 'Active');
            const indoorSpots = propSpots.filter(s => s.spot_type === 'Indoor');
            const outdoorSpots = propSpots.filter(s => s.spot_type === 'Outdoor');
            const occupiedCount = propSpots.filter(s => s.status === 'Occupied').length;
            const vacantCount = propSpots.filter(s => s.status === 'Vacant').length;
            const noticeCount = propSpots.filter(s => s.status === 'Notice').length;
            // Occupancy: (Occupied + Notice) / (Occupied + Vacant + Notice) - excludes Reserved/Future
            const activeCount = occupiedCount + vacantCount + noticeCount;
            const filledCount = occupiedCount + noticeCount;
            
            return {
              property: prop,
              totalSpots: propSpots.length,
              occupiedSpots: occupiedCount,
              vacantSpots: vacantCount,
              noticeSpots: noticeCount,
              occupancyRate: activeCount > 0 ? Math.round((filledCount / activeCount) * 100) : 0,
              indoorTotal: indoorSpots.length,
              indoorVacant: indoorSpots.filter(s => s.status === 'Vacant').length,
              outdoorTotal: outdoorSpots.length,
              outdoorVacant: outdoorSpots.filter(s => s.status === 'Vacant').length,
              waitlistFirstSpot: propWaitlist.filter(w => w.waitlist_type === '1st Spot').length,
              waitlistIndoorUpgrade: propWaitlist.filter(w => w.waitlist_type === 'Indoor Upgrade').length,
              waitlistSecondSpot: propWaitlist.filter(w => w.waitlist_type === '2nd Spot').length,
              waitlistTotal: propWaitlist.length,
            };
          });

          const response = await fetch('/api/parking/snapshot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ snapshots }),
          });

          const result = await response.json();
          if (result.success) {
            setSnapshotsCaptured(true);
            if (!result.alreadyExists) {
              console.log('Daily parking snapshot captured');
            }
          }
        } catch (error) {
          console.error('Error capturing snapshot:', error);
        }
      };

      captureSnapshot();
    }
  }, [spots, properties, waitlist, loading, snapshotsCaptured]);

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  const [revertingId, setRevertingId] = useState<string | null>(null);

  const handleRevertChange = async (change: ParkingChange) => {
    if (!confirm(`Are you sure you want to undo this ${change.type} change for ${change.tenant_name}?`)) {
      return;
    }

    setRevertingId(change.id);
    try {
      const response = await fetch('/api/parking/change/revert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          changeId: change.id,
          revertedBy: userFullName || user?.email || 'Unknown',
        }),
      });

      const result = await response.json();

      if (result.success) {
        alert(result.message);
        fetchData(); // Refresh the activity log
      } else {
        alert(`Failed to revert: ${result.error}`);
      }
    } catch (error) {
      console.error('Error reverting change:', error);
      alert('Failed to revert change. Please try again.');
    } finally {
      setRevertingId(null);
    }
  };

  const handleUndoRevert = async (change: ParkingChange) => {
    if (!confirm(`Are you sure you want to restore this ${change.type} change for ${change.tenant_name}?`)) {
      return;
    }

    setRevertingId(change.id);
    try {
      const response = await fetch('/api/parking/change/revert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'undoRevert',
          changeId: change.id,
          undoneBy: userFullName || user?.email || 'Unknown',
        }),
      });

      const result = await response.json();

      if (result.success) {
        alert(result.message);
        fetchData(); // Refresh the activity log
      } else {
        alert(`Failed to restore: ${result.error}`);
      }
    } catch (error) {
      console.error('Error restoring change:', error);
      alert('Failed to restore change. Please try again.');
    } finally {
      setRevertingId(null);
    }
  };

  // Check if a reverted change can be undone (within 24 hours)
  const canUndoRevert = (change: ParkingChange) => {
    if (!change.reverted || !change.reverted_at) return false;
    const revertedAt = new Date(change.reverted_at);
    const now = new Date();
    const hoursSinceRevert = (now.getTime() - revertedAt.getTime()) / (1000 * 60 * 60);
    return hoursSinceRevert <= 24;
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const stats = {
    total: spots.length,
    occupied: spots.filter(s => s.status === 'Occupied').length,
    vacant: spots.filter(s => s.status === 'Vacant').length,
    notice: spots.filter(s => s.status === 'Notice').length,
    reserved: spots.filter(s => s.status === 'Reserved').length,
    indoor: spots.filter(s => s.spot_type === 'Indoor').length,
    outdoor: spots.filter(s => s.spot_type === 'Outdoor').length,
    indoorVacant: spots.filter(s => s.spot_type === 'Indoor' && s.status === 'Vacant').length,
    outdoorVacant: spots.filter(s => s.spot_type === 'Outdoor' && s.status === 'Vacant').length,
    // Occupancy rate: (Occupied + Notice) / (Occupied + Vacant + Notice) - excludes Reserved/Future
    occupancyRate: (() => {
      const activeSpots = spots.filter(s => s.status === 'Occupied' || s.status === 'Vacant' || s.status === 'Notice');
      const filledSpots = spots.filter(s => s.status === 'Occupied' || s.status === 'Notice');
      return activeSpots.length > 0 ? Math.round((filledSpots.length / activeSpots.length) * 100) : 0;
    })(),
    waitlistTotal: waitlist.filter(w => w.status === 'Active').length,
    firstSpot: waitlist.filter(w => w.waitlist_type === '1st Spot' && w.status === 'Active').length,
    secondSpot: waitlist.filter(w => w.waitlist_type === '2nd Spot' && w.status === 'Active').length,
    indoorUpgrade: waitlist.filter(w => w.waitlist_type === 'Indoor Upgrade' && w.status === 'Active').length,
    recentChanges: activityLog.filter(a => {
      const date = new Date(a.submission_date);
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return date >= weekAgo;
    }).length,
  };

  // Apply filters to spots (property filter is required)
  const filteredSpots = spots.filter(spot => {
    if (!propertyFilter || spot.property !== propertyFilter) return false;
    if (statusFilter !== 'all' && spot.status !== statusFilter) return false;
    if (typeFilter !== 'all' && spot.spot_type !== typeFilter) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        spot.full_space_code.toLowerCase().includes(query) ||
        spot.spot_number.toLowerCase().includes(query) ||
        (spot.tenant_code && spot.tenant_code.toLowerCase().includes(query)) ||
        (spot.tenant_name && spot.tenant_name.toLowerCase().includes(query))
      );
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => router.push('/')}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Hub
              </Button>
              <img src="/highpoint-logo.png" alt="Highpoint Living" className="h-10 w-auto" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Parking Manager
                </h1>
                <p className="text-sm text-muted-foreground">
                  Inventory Tracking & Waitlist Management
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <ParkingChangeForm 
                onSubmitSuccess={fetchData}
                submitterName={userFullName || 'Unknown'}
                properties={properties}
                spots={spots}
              />
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
        <Tabs defaultValue="inventory" className="space-y-4">
          <TabsList>
            <TabsTrigger value="inventory">
              <span className="flex items-center gap-2">
                <Car className="h-4 w-4" />
                Inventory
                <Badge variant="secondary" className="ml-1">{stats.total}</Badge>
              </span>
            </TabsTrigger>
            <TabsTrigger value="waitlist">
              <span className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Waitlist
                {stats.waitlistTotal > 0 && (
                  <Badge variant="destructive" className="ml-1">{stats.waitlistTotal}</Badge>
                )}
              </span>
            </TabsTrigger>
            <TabsTrigger value="activity">
              <span className="flex items-center gap-2">
                <History className="h-4 w-4" />
                Activity Log
              </span>
            </TabsTrigger>
            <TabsTrigger value="tracking">
              <span className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Tracking
              </span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="inventory">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div>
                      <CardTitle>Parking Inventory</CardTitle>
                      <CardDescription>
                        {lastUpdated && `Last synced: ${new Date(lastUpdated).toLocaleString()}`}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={propertyFilter} onValueChange={setPropertyFilter}>
                      <SelectTrigger className="w-[220px]">
                        <SelectValue placeholder="Select a Property" />
                      </SelectTrigger>
                      <SelectContent>
                        {properties.map(p => (
                          <SelectItem key={p} value={p}>{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Download className="h-4 w-4 mr-1" />
                          Export
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          disabled={!propertyFilter}
                          onClick={() => exportParkingToPDF(spots, propertyFilter, false)}
                        >
                          <FileText className="h-4 w-4 mr-2" />
                          Export Current Property (PDF)
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => exportParkingToPDF(spots, null, true)}
                        >
                          <ParkingCircle className="h-4 w-4 mr-2" />
                          Export All Properties (PDF)
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
                      <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    <span className="ml-3 text-muted-foreground">Loading inventory...</span>
                  </div>
                ) : !propertyFilter || propertyFilter === 'all' ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <ParkingCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium">Select a Property</p>
                    <p className="text-sm">Choose a property from the dropdown above to view its parking inventory.</p>
                    <div className="mt-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-w-3xl mx-auto">
                      {properties.map(p => {
                        const propSpots = spots.filter(s => s.property === p);
                        const vacant = propSpots.filter(s => s.status === 'Vacant').length;
                        const notice = propSpots.filter(s => s.status === 'Notice').length;
                        return (
                          <button
                            key={p}
                            onClick={() => setPropertyFilter(p)}
                            className="p-3 rounded-lg border hover:bg-muted/50 text-left transition-colors"
                          >
                            <div className="font-medium text-sm">{p}</div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {propSpots.length} spots • {vacant} vacant{notice > 0 && <span className="text-orange-500"> • {notice} notice</span>}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Property Stats */}
                    <div className="grid grid-cols-4 gap-3 mb-4">
                      {(() => {
                        const propSpots = spots.filter(s => s.property === propertyFilter);
                        return (
                          <>
                            <div className="p-3 rounded-lg bg-muted/50 text-center">
                              <div className="text-2xl font-bold">{propSpots.length}</div>
                              <div className="text-xs text-muted-foreground">Total</div>
                            </div>
                            <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 text-center">
                              <div className="text-2xl font-bold text-green-600">{propSpots.filter(s => s.status === 'Occupied').length}</div>
                              <div className="text-xs text-muted-foreground">Occupied</div>
                            </div>
                            <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-center">
                              <div className="text-2xl font-bold text-blue-600">{propSpots.filter(s => s.status === 'Vacant').length}</div>
                              <div className="text-xs text-muted-foreground">Vacant</div>
                            </div>
                            <div className="p-3 rounded-lg bg-orange-50 dark:bg-orange-900/20 text-center">
                              <div className="text-2xl font-bold text-orange-600">{propSpots.filter(s => s.status === 'Notice').length}</div>
                              <div className="text-xs text-muted-foreground">Notice</div>
                            </div>
                          </>
                        );
                      })()}
                    </div>

                    {/* Filters */}
                    <div className="flex flex-wrap gap-3 mb-4">
                      <div className="relative flex-1 min-w-[200px]">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search by spot or tenant..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-10"
                        />
                      </div>
                      <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-[140px]">
                          <SelectValue placeholder="All Statuses" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Statuses</SelectItem>
                          <SelectItem value="Occupied">Occupied</SelectItem>
                          <SelectItem value="Vacant">Vacant</SelectItem>
                          <SelectItem value="Notice">Notice</SelectItem>
                          <SelectItem value="Reserved">Reserved</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={typeFilter} onValueChange={setTypeFilter}>
                        <SelectTrigger className="w-[120px]">
                          <SelectValue placeholder="All Types" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Types</SelectItem>
                          <SelectItem value="Indoor">Indoor</SelectItem>
                          <SelectItem value="Outdoor">Outdoor</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Table */}
                    <div className="rounded-md border overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[100px]">Spot #</TableHead>
                            <TableHead className="w-[90px]">Type</TableHead>
                            <TableHead className="w-[100px]">Status</TableHead>
                            <TableHead className="w-[90px]">Rent</TableHead>
                            <TableHead className="w-[70px]">Unit</TableHead>
                            <TableHead className="w-[140px]">Tenant</TableHead>
                            <TableHead className="w-[80px]">Features</TableHead>
                            <TableHead className="w-[110px]">Lease Start</TableHead>
                            <TableHead className="w-[110px]">Termination</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredSpots.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                                No spots match your filters
                              </TableCell>
                            </TableRow>
                          ) : (
                            filteredSpots.map((spot) => (
                              <TableRow key={spot.id || spot.full_space_code}>
                                <TableCell className="font-medium">{spot.full_space_code || spot.spot_number || '—'}</TableCell>
                                <TableCell>
                                  <Badge variant={spot.spot_type === 'Indoor' ? 'default' : 'outline'} className="text-xs">
                                    {spot.spot_type}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <Badge 
                                    variant={
                                      spot.status === 'Occupied' ? 'default' :
                                      spot.status === 'Vacant' ? 'secondary' :
                                      spot.status === 'Notice' ? 'destructive' :
                                      'outline'
                                    }
                                    className="text-xs"
                                  >
                                    {spot.status}
                                  </Badge>
                                </TableCell>
                                <TableCell>${spot.monthly_rent}</TableCell>
                                <TableCell className="text-sm">
                                  {spot.unit_number || <span className="text-muted-foreground">—</span>}
                                </TableCell>
                                <TableCell className="text-sm">
                                  {spot.tenant_code ? (
                                    <div>
                                      <div className="flex items-center gap-1">
                                        {spot.tenant_name && <span className="font-medium">{spot.tenant_name}</span>}
                                        {spot.status === 'Notice' && (
                                          <Badge variant="outline" className="text-[10px] px-1 py-0 bg-orange-50 text-orange-600 border-orange-300">
                                            Leaving
                                          </Badge>
                                        )}
                                      </div>
                                      <span className="text-muted-foreground text-xs">{spot.tenant_code}</span>
                                      {/* Show future tenant indicator if there's one */}
                                      {spot.has_future_tenant && spot.future_tenant_name && (
                                        <div className="mt-1 p-1 bg-blue-50 border border-blue-200 rounded text-[10px]">
                                          <div className="flex items-center gap-1 text-blue-700">
                                            <Calendar className="h-3 w-3" />
                                            <span className="font-medium">Future: {spot.future_tenant_name}</span>
                                          </div>
                                          <div className="text-blue-600">
                                            Unit {spot.future_unit_number} • Starts {spot.future_start_date ? new Date(spot.future_start_date + 'T00:00:00').toLocaleDateString() : 'TBD'}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  ) : spot.has_future_tenant ? (
                                    <div className="p-1 bg-blue-50 border border-blue-200 rounded text-[10px]">
                                      <div className="flex items-center gap-1 text-blue-700">
                                        <Calendar className="h-3 w-3" />
                                        <span className="font-medium">Future: {spot.future_tenant_name || 'Assigned'}</span>
                                      </div>
                                      <div className="text-blue-600">
                                        {spot.future_unit_number && <>Unit {spot.future_unit_number} • </>}
                                        Starts {spot.future_start_date ? new Date(spot.future_start_date + 'T00:00:00').toLocaleDateString() : 'TBD'}
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <div className="flex gap-1">
                                    {spot.has_ev_charging && (
                                      <span title="EV Charging"><Zap className="h-4 w-4 text-yellow-500" /></span>
                                    )}
                                    {spot.is_handicap && (
                                      <span title="Handicap"><Accessibility className="h-4 w-4 text-blue-500" /></span>
                                    )}
                                    {!spot.has_ev_charging && !spot.is_handicap && (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {spot.lease_start_date 
                                    ? new Date(spot.lease_start_date + 'T00:00:00').toLocaleDateString()
                                    : '—'}
                                </TableCell>
                                <TableCell className="text-sm">
                                  {spot.termination_date ? (
                                    <div>
                                      <span className={spot.status === 'Notice' ? 'text-orange-600 font-medium' : 'text-muted-foreground'}>
                                        {new Date(spot.termination_date + 'T00:00:00').toLocaleDateString()}
                                      </span>
                                      {spot.status === 'Notice' && spot.available_date && (
                                        <div className="text-[10px] text-green-600">
                                          Available {new Date(spot.available_date + 'T00:00:00').toLocaleDateString()}
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                      <div className="px-4 py-2 text-sm text-muted-foreground border-t">
                        Showing {filteredSpots.length} spots for {propertyFilter}
                      </div>
                    </div>

                    {/* Waitlist Preview for Selected Property */}
                    {(() => {
                      const propertyWaitlist = waitlist.filter(w => w.property === propertyFilter && w.status === 'Active');
                      if (propertyWaitlist.length === 0) return null;
                      
                      return (
                        <div className="mt-6 p-4 rounded-lg border bg-amber-50 dark:bg-amber-900/10">
                          <div className="flex items-center gap-2 mb-3">
                            <Users className="h-5 w-5 text-amber-600" />
                            <h3 className="font-semibold text-amber-800 dark:text-amber-200">
                              Waitlist for {propertyFilter} ({propertyWaitlist.length})
                            </h3>
                          </div>
                          <div className="space-y-2">
                            {propertyWaitlist
                              .sort((a, b) => {
                                const priority: Record<string, number> = { '1st Spot': 1, 'Indoor Upgrade': 2, '2nd Spot': 3 };
                                const pA = priority[a.waitlist_type] || 3;
                                const pB = priority[b.waitlist_type] || 3;
                                if (pA !== pB) return pA - pB;
                                return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
                              })
                              .map((entry, idx) => (
                                <div key={entry.id} className="flex items-center justify-between p-2 bg-white dark:bg-gray-800 rounded border text-sm">
                                  <div className="flex items-center gap-3">
                                    <span className="text-muted-foreground w-5">{idx + 1}.</span>
                                    <span className="font-medium">{entry.tenant_name}</span>
                                    <span className="text-muted-foreground">Unit {entry.unit_number}</span>
                                  </div>
                                  <Badge 
                                    className={`text-white ${
                                      entry.waitlist_type === '1st Spot' ? 'bg-purple-500' :
                                      entry.waitlist_type === 'Indoor Upgrade' ? 'bg-teal-500' :
                                      'bg-indigo-400'
                                    }`}
                                  >
                                    {entry.waitlist_type}
                                  </Badge>
                                </div>
                              ))}
                          </div>
                        </div>
                      );
                    })()}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="waitlist">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Parking Waitlist</CardTitle>
                    <CardDescription>
                      Priority: 1st Spot → Indoor Upgrade → 2nd Spot (FIFO within each type)
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    <span className="ml-3 text-muted-foreground">Loading waitlist...</span>
                  </div>
                ) : (
                  <ParkingWaitlistTable
                    entries={waitlist}
                    properties={properties}
                    onRefresh={fetchData}
                    currentUserEmail={user?.email}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activity">
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Parking Activity Log</CardTitle>
                      <CardDescription>
                        View all parking change requests submitted.
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => {
                          const filtered = activityLog.filter(a => {
                            if (activityFilter !== 'all' && a.type !== activityFilter) return false;
                            if (activityDateFrom) {
                              const date = new Date(a.submission_date);
                              if (date < new Date(activityDateFrom)) return false;
                            }
                            if (activityDateTo) {
                              const date = new Date(a.submission_date);
                              const toDate = new Date(activityDateTo);
                              toDate.setHours(23, 59, 59);
                              if (date > toDate) return false;
                            }
                            if (activitySearch) {
                              const query = activitySearch.toLowerCase();
                              return a.tenant_name.toLowerCase().includes(query) ||
                                a.tenant_unit.toLowerCase().includes(query) ||
                                a.primary_space.toLowerCase().includes(query);
                            }
                            return true;
                          });
                          const csv = [
                            ['Date', 'Type', 'Tenant', 'Unit', 'Space', 'Transfer To', 'Effective Date', 'Submitter', 'Notes'].join(','),
                            ...filtered.map(a => [
                              new Date(a.submission_date).toLocaleDateString(),
                              a.type,
                              `"${a.tenant_name}"`,
                              `"${a.tenant_unit}"`,
                              `"${a.primary_space}"`,
                              `"${a.transfer_to_space || ''}"`,
                              new Date(a.effective_date).toLocaleDateString(),
                              `"${a.submitter}"`,
                              `"${(a.other_notes || '').replace(/"/g, '""')}"`
                            ].join(','))
                          ].join('\n');
                          const blob = new Blob([csv], { type: 'text/csv' });
                          const url = URL.createObjectURL(blob);
                          const link = document.createElement('a');
                          link.href = url;
                          link.download = `parking-activity-${new Date().toISOString().split('T')[0]}.csv`;
                          link.click();
                        }}
                      >
                        <Download className="h-4 w-4 mr-1" />
                        Export
                      </Button>
                      <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                      </Button>
                    </div>
                  </div>
                  {/* Filters Row */}
                  <div className="flex flex-wrap gap-3">
                    <div className="relative flex-1 min-w-[180px]">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search tenant, unit, space..."
                        value={activitySearch}
                        onChange={(e) => setActivitySearch(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                    <Select value={activityFilter} onValueChange={setActivityFilter}>
                      <SelectTrigger className="w-[140px]">
                        <SelectValue placeholder="All Types" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="Termination">Termination</SelectItem>
                        <SelectItem value="Add">Add</SelectItem>
                        <SelectItem value="Transfer">Transfer</SelectItem>
                        <SelectItem value="New Lease Signed">New Lease</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <Input
                        type="date"
                        value={activityDateFrom}
                        onChange={(e) => setActivityDateFrom(e.target.value)}
                        className="w-[140px]"
                        placeholder="From"
                      />
                      <span className="text-muted-foreground">to</span>
                      <Input
                        type="date"
                        value={activityDateTo}
                        onChange={(e) => setActivityDateTo(e.target.value)}
                        className="w-[140px]"
                        placeholder="To"
                      />
                      {(activityDateFrom || activityDateTo || activitySearch) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setActivityDateFrom('');
                            setActivityDateTo('');
                            setActivitySearch('');
                          }}
                        >
                          Clear
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    <span className="ml-3 text-muted-foreground">Loading activity...</span>
                  </div>
                ) : activityLog.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium">No activity yet</p>
                    <p className="text-sm">Submit parking change requests to see them here.</p>
                  </div>
                ) : (
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[100px]">Date</TableHead>
                          <TableHead className="w-[100px]">Type</TableHead>
                          <TableHead>Tenant</TableHead>
                          <TableHead>Space</TableHead>
                          <TableHead>Effective</TableHead>
                          <TableHead>Submitter</TableHead>
                          <TableHead className="w-[60px]">Status</TableHead>
                          <TableHead className="w-[80px]">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {activityLog
                          .filter(a => {
                            if (activityFilter !== 'all' && a.type !== activityFilter) return false;
                            if (activityDateFrom) {
                              const date = new Date(a.submission_date);
                              if (date < new Date(activityDateFrom)) return false;
                            }
                            if (activityDateTo) {
                              const date = new Date(a.submission_date);
                              const toDate = new Date(activityDateTo);
                              toDate.setHours(23, 59, 59);
                              if (date > toDate) return false;
                            }
                            if (activitySearch) {
                              const query = activitySearch.toLowerCase();
                              return a.tenant_name.toLowerCase().includes(query) ||
                                a.tenant_unit.toLowerCase().includes(query) ||
                                a.primary_space.toLowerCase().includes(query);
                            }
                            return true;
                          })
                          .map((activity) => (
                            <TableRow key={activity.id}>
                              <TableCell className="text-sm text-muted-foreground">
                                {new Date(activity.submission_date).toLocaleDateString()}
                              </TableCell>
                              <TableCell>
                                <Badge 
                                  className={`text-white ${
                                    activity.type === 'Termination' ? 'bg-red-500' :
                                    activity.type === 'Add' ? 'bg-green-500' :
                                    activity.type === 'Transfer' ? 'bg-blue-500' :
                                    'bg-purple-500'
                                  }`}
                                >
                                  {activity.type}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div>
                                  <div className="font-medium">{activity.tenant_name}</div>
                                  <div className="text-xs text-muted-foreground">{activity.tenant_unit}</div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div>
                                  <div className="font-medium">{activity.primary_space}</div>
                                  {activity.transfer_to_space && (
                                    <div className="text-xs text-muted-foreground">→ {activity.transfer_to_space}</div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-sm">
                                {new Date(activity.effective_date).toLocaleDateString()}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {activity.submitter}
                              </TableCell>
                              <TableCell>
                                {activity.reverted ? (
                                  <Badge variant="outline" className="text-orange-600 border-orange-300 bg-orange-50">
                                    Reverted
                                  </Badge>
                                ) : activity.synced_to_sheet ? (
                                  <span title="Synced to sheet"><CheckCircle className="h-4 w-4 text-green-500" /></span>
                                ) : (
                                  <span title="Not synced"><AlertTriangle className="h-4 w-4 text-yellow-500" /></span>
                                )}
                              </TableCell>
                              <TableCell>
                                {!activity.reverted ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                                    onClick={() => handleRevertChange(activity)}
                                    disabled={revertingId === activity.id}
                                    title="Undo this change"
                                  >
                                    {revertingId === activity.id ? (
                                      <RefreshCw className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Undo2 className="h-4 w-4" />
                                    )}
                                  </Button>
                                ) : canUndoRevert(activity) ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                    onClick={() => handleUndoRevert(activity)}
                                    disabled={revertingId === activity.id}
                                    title="Restore this change"
                                  >
                                    {revertingId === activity.id ? (
                                      <RefreshCw className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <span className="text-xs font-medium">Restore</span>
                                    )}
                                  </Button>
                                ) : null}
                              </TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                    <div className="px-4 py-2 text-sm text-muted-foreground border-t">
                      Showing {activityLog.filter(a => {
                        if (activityFilter !== 'all' && a.type !== activityFilter) return false;
                        if (activityDateFrom && new Date(a.submission_date) < new Date(activityDateFrom)) return false;
                        if (activityDateTo) {
                          const toDate = new Date(activityDateTo);
                          toDate.setHours(23, 59, 59);
                          if (new Date(a.submission_date) > toDate) return false;
                        }
                        if (activitySearch) {
                          const query = activitySearch.toLowerCase();
                          return a.tenant_name.toLowerCase().includes(query) ||
                            a.tenant_unit.toLowerCase().includes(query) ||
                            a.primary_space.toLowerCase().includes(query);
                        }
                        return true;
                      }).length} of {activityLog.length} entries
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tracking">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="h-5 w-5" />
                      Tracking Dashboard
                    </CardTitle>
                    <CardDescription>
                      Occupancy metrics and opportunity analysis by property
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={propertyFilter} onValueChange={setPropertyFilter}>
                      <SelectTrigger className="w-[200px]">
                        <Building2 className="h-4 w-4 mr-2" />
                        <SelectValue placeholder="Select property" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Properties</SelectItem>
                        {properties.map(prop => (
                          <SelectItem key={prop} value={prop}>{prop}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
                      <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Property-filtered stats */}
                    {(() => {
                      const filteredForTracking = propertyFilter && propertyFilter !== 'all' 
                        ? spots.filter(s => s.property === propertyFilter)
                        : spots;
                      const waitlistFiltered = propertyFilter && propertyFilter !== 'all'
                        ? waitlist.filter(w => w.property === propertyFilter && w.status === 'Active')
                        : waitlist.filter(w => w.status === 'Active');
                      
                      const totalSpots = filteredForTracking.length;
                      const occupiedSpots = filteredForTracking.filter(s => s.status === 'Occupied').length;
                      const vacantSpots = filteredForTracking.filter(s => s.status === 'Vacant').length;
                      const noticeSpots = filteredForTracking.filter(s => s.status === 'Notice').length;
                      const indoorSpots = filteredForTracking.filter(s => s.spot_type === 'Indoor');
                      const outdoorSpots = filteredForTracking.filter(s => s.spot_type === 'Outdoor');
                      const indoorVacant = indoorSpots.filter(s => s.status === 'Vacant').length;
                      const outdoorVacant = outdoorSpots.filter(s => s.status === 'Vacant').length;
                      // Occupancy rate: (Occupied + Notice) / (Occupied + Vacant + Notice) - excludes Reserved/Future
                      const activeSpots = occupiedSpots + vacantSpots + noticeSpots;
                      const occupancyRate = activeSpots > 0 ? Math.round(((occupiedSpots + noticeSpots) / activeSpots) * 100) : 0;
                      
                      return (
                        <>
                          {/* Main KPI Cards */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border-blue-200">
                              <CardHeader className="pb-2">
                                <CardDescription className="text-blue-700 dark:text-blue-300">Total Spots</CardDescription>
                                <CardTitle className="text-3xl text-blue-900 dark:text-blue-100">{totalSpots}</CardTitle>
                              </CardHeader>
                              <CardContent className="pt-0">
                                <p className="text-xs text-blue-600 dark:text-blue-400">
                                  {indoorSpots.length} indoor • {outdoorSpots.length} outdoor
                                </p>
                              </CardContent>
                            </Card>
                            
                            <Card className={`bg-gradient-to-br ${occupancyRate >= 90 ? 'from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 border-green-200' : occupancyRate >= 70 ? 'from-yellow-50 to-yellow-100 dark:from-yellow-900/20 dark:to-yellow-800/20 border-yellow-200' : 'from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 border-red-200'}`}>
                              <CardHeader className="pb-2">
                                <CardDescription className={occupancyRate >= 90 ? 'text-green-700' : occupancyRate >= 70 ? 'text-yellow-700' : 'text-red-700'}>Occupancy Rate</CardDescription>
                                <CardTitle className={`text-3xl flex items-center gap-2 ${occupancyRate >= 90 ? 'text-green-900' : occupancyRate >= 70 ? 'text-yellow-900' : 'text-red-900'}`}>
                                  <TrendingUp className="h-5 w-5" />
                                  {occupancyRate}%
                                </CardTitle>
                              </CardHeader>
                              <CardContent className="pt-0">
                                <p className={`text-xs ${occupancyRate >= 90 ? 'text-green-600' : occupancyRate >= 70 ? 'text-yellow-600' : 'text-red-600'}`}>
                                  {occupiedSpots} of {totalSpots} occupied
                                </p>
                              </CardContent>
                            </Card>
                            
                            <Card className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 border-orange-200">
                              <CardHeader className="pb-2">
                                <CardDescription className="text-orange-700 dark:text-orange-300">Available Now</CardDescription>
                                <CardTitle className="text-3xl text-orange-900 dark:text-orange-100">{vacantSpots}</CardTitle>
                              </CardHeader>
                              <CardContent className="pt-0">
                                <p className="text-xs text-orange-600 dark:text-orange-400">
                                  {indoorVacant} indoor • {outdoorVacant} outdoor
                                </p>
                              </CardContent>
                            </Card>
                            
                            <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 border-purple-200">
                              <CardHeader className="pb-2">
                                <CardDescription className="text-purple-700 dark:text-purple-300">Upcoming Vacancy</CardDescription>
                                <CardTitle className="text-3xl text-purple-900 dark:text-purple-100">{noticeSpots}</CardTitle>
                              </CardHeader>
                              <CardContent className="pt-0">
                                <p className="text-xs text-purple-600 dark:text-purple-400">On notice / terminating</p>
                              </CardContent>
                            </Card>
                          </div>

                          {/* Waitlist & Opportunity Section */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Card>
                              <CardHeader>
                                <CardTitle className="text-lg flex items-center gap-2">
                                  <Users className="h-5 w-5 text-blue-500" />
                                  Waitlist Demand
                                </CardTitle>
                              </CardHeader>
                              <CardContent>
                                <div className="space-y-3">
                                  <div className="flex items-center justify-between p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                                    <span className="font-medium">1st Spot Requests</span>
                                    <Badge className="bg-purple-500 text-white">
                                      {waitlistFiltered.filter(w => w.waitlist_type === '1st Spot').length}
                                    </Badge>
                                  </div>
                                  <div className="flex items-center justify-between p-3 bg-teal-50 dark:bg-teal-900/20 rounded-lg">
                                    <span className="font-medium">Indoor Upgrades</span>
                                    <Badge className="bg-teal-500 text-white">
                                      {waitlistFiltered.filter(w => w.waitlist_type === 'Indoor Upgrade').length}
                                    </Badge>
                                  </div>
                                  <div className="flex items-center justify-between p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg">
                                    <span className="font-medium">2nd Spot Requests</span>
                                    <Badge className="bg-indigo-400 text-white">
                                      {waitlistFiltered.filter(w => w.waitlist_type === '2nd Spot').length}
                                    </Badge>
                                  </div>
                                  <div className="pt-2 border-t">
                                    <div className="flex items-center justify-between font-semibold">
                                      <span>Total Active Waitlist</span>
                                      <span className="text-lg">{waitlistFiltered.length}</span>
                                    </div>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>

                            <Card>
                              <CardHeader>
                                <CardTitle className="text-lg flex items-center gap-2">
                                  <Target className="h-5 w-5 text-green-500" />
                                  Opportunity Analysis
                                </CardTitle>
                              </CardHeader>
                              <CardContent>
                                <div className="space-y-3">
                                  <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="font-medium">Waitlist vs Vacancy Match</span>
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                      {waitlistFiltered.filter(w => w.waitlist_type === '1st Spot').length > 0 && vacantSpots > 0 ? (
                                        <span className="text-green-600 font-medium">
                                          ✓ {Math.min(waitlistFiltered.filter(w => w.waitlist_type === '1st Spot').length, vacantSpots)} spots can be filled from 1st Spot waitlist
                                        </span>
                                      ) : vacantSpots === 0 ? (
                                        <span className="text-gray-500">No vacant spots available</span>
                                      ) : (
                                        <span className="text-gray-500">No 1st Spot waitlist demand</span>
                                      )}
                                    </p>
                                  </div>
                                  
                                  <div className="p-3 bg-teal-50 dark:bg-teal-900/20 rounded-lg">
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="font-medium">Indoor Upgrade Potential</span>
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                      {waitlistFiltered.filter(w => w.waitlist_type === 'Indoor Upgrade').length > 0 && indoorVacant > 0 ? (
                                        <span className="text-teal-600 font-medium">
                                          ✓ {Math.min(waitlistFiltered.filter(w => w.waitlist_type === 'Indoor Upgrade').length, indoorVacant)} indoor upgrades possible
                                        </span>
                                      ) : indoorVacant === 0 ? (
                                        <span className="text-gray-500">No indoor spots vacant</span>
                                      ) : (
                                        <span className="text-gray-500">No upgrade waitlist demand</span>
                                      )}
                                    </p>
                                  </div>

                                  <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="font-medium">Unfilled Vacancy</span>
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                      {vacantSpots > waitlistFiltered.filter(w => w.waitlist_type === '1st Spot').length ? (
                                        <span className="text-orange-600 font-medium">
                                          ⚠ {vacantSpots - waitlistFiltered.filter(w => w.waitlist_type === '1st Spot').length} spots without waitlist demand
                                        </span>
                                      ) : (
                                        <span className="text-green-600">All vacancies have waitlist coverage</span>
                                      )}
                                    </p>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          </div>

                          {/* Property Breakdown (only show when viewing all properties) */}
                          {(!propertyFilter || propertyFilter === 'all') && (
                            <Card>
                              <CardHeader>
                                <CardTitle className="text-lg flex items-center gap-2">
                                  <Building2 className="h-5 w-5" />
                                  Property Breakdown
                                </CardTitle>
                              </CardHeader>
                              <CardContent>
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Property</TableHead>
                                      <TableHead className="text-center">Total</TableHead>
                                      <TableHead className="text-center">Occupied</TableHead>
                                      <TableHead className="text-center">Vacant</TableHead>
                                      <TableHead className="text-center">Notice</TableHead>
                                      <TableHead className="text-center">Occupancy</TableHead>
                                      <TableHead className="text-center">Waitlist</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {properties.map(prop => {
                                      const propSpots = spots.filter(s => s.property === prop);
                                      const propOccupied = propSpots.filter(s => s.status === 'Occupied').length;
                                      const propVacant = propSpots.filter(s => s.status === 'Vacant').length;
                                      const propNotice = propSpots.filter(s => s.status === 'Notice').length;
                                      // Occupancy: (Occupied + Notice) / (Occupied + Vacant + Notice) - excludes Reserved/Future
                                      const propActiveSpots = propOccupied + propVacant + propNotice;
                                      const propOccupancy = propActiveSpots > 0 ? Math.round(((propOccupied + propNotice) / propActiveSpots) * 100) : 0;
                                      const propWaitlist = waitlist.filter(w => w.property === prop && w.status === 'Active').length;
                                      
                                      return (
                                        <TableRow key={prop}>
                                          <TableCell className="font-medium">{prop}</TableCell>
                                          <TableCell className="text-center">{propSpots.length}</TableCell>
                                          <TableCell className="text-center text-green-600">{propOccupied}</TableCell>
                                          <TableCell className="text-center text-orange-600">{propVacant}</TableCell>
                                          <TableCell className="text-center text-yellow-600">{propNotice}</TableCell>
                                          <TableCell className="text-center">
                                            <Badge className={propOccupancy >= 90 ? 'bg-green-100 text-green-800' : propOccupancy >= 70 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}>
                                              {propOccupancy}%
                                            </Badge>
                                          </TableCell>
                                          <TableCell className="text-center">
                                            {propWaitlist > 0 ? (
                                              <Badge variant="secondary">{propWaitlist}</Badge>
                                            ) : (
                                              <span className="text-muted-foreground">-</span>
                                            )}
                                          </TableCell>
                                        </TableRow>
                                      );
                                    })}
                                  </TableBody>
                                </Table>
                              </CardContent>
                            </Card>
                          )}

                          {/* Historical Trends Section */}
                          <Card>
                            <CardHeader>
                              <div className="flex items-center justify-between">
                                <CardTitle className="text-lg flex items-center gap-2">
                                  <TrendingUp className="h-5 w-5" />
                                  Historical Trends (30 Days)
                                </CardTitle>
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  onClick={() => fetchHistoricalData(propertyFilter)}
                                  disabled={trendLoading}
                                >
                                  {trendLoading ? (
                                    <RefreshCw className="h-4 w-4 animate-spin" />
                                  ) : (
                                    'Load Trends'
                                  )}
                                </Button>
                              </div>
                            </CardHeader>
                            <CardContent>
                              {trendLoading ? (
                                <div className="flex items-center justify-center py-8">
                                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                                </div>
                              ) : historicalData.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground">
                                  <p>No historical data available yet.</p>
                                  <p className="text-sm mt-2">Snapshots are captured daily when the page loads. Click &quot;Load Trends&quot; to fetch available data.</p>
                                </div>
                              ) : (
                                <div className="space-y-4">
                                  <div className="overflow-x-auto">
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead>Date</TableHead>
                                          <TableHead className="text-center">Total</TableHead>
                                          <TableHead className="text-center">Occupied</TableHead>
                                          <TableHead className="text-center">Vacant</TableHead>
                                          <TableHead className="text-center">Occupancy</TableHead>
                                          <TableHead className="text-center">Waitlist</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {historicalData.slice(-10).reverse().map((snapshot, idx) => (
                                          <TableRow key={idx}>
                                            <TableCell className="font-medium">
                                              {new Date(snapshot.snapshot_date).toLocaleDateString()}
                                            </TableCell>
                                            <TableCell className="text-center">{snapshot.total_spots}</TableCell>
                                            <TableCell className="text-center text-green-600">{snapshot.occupied_spots}</TableCell>
                                            <TableCell className="text-center text-orange-600">{snapshot.vacant_spots}</TableCell>
                                            <TableCell className="text-center">
                                              <Badge className={snapshot.occupancy_rate >= 90 ? 'bg-green-100 text-green-800' : snapshot.occupancy_rate >= 70 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}>
                                                {snapshot.occupancy_rate}%
                                              </Badge>
                                            </TableCell>
                                            <TableCell className="text-center">{snapshot.waitlist_total}</TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  </div>
                                  {historicalData.length > 1 && (
                                    <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                                      <p className="text-sm font-medium mb-2">Trend Summary</p>
                                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                        <div>
                                          <span className="text-muted-foreground">First Record:</span>
                                          <p className="font-medium">{historicalData[0].occupancy_rate}% occupancy</p>
                                        </div>
                                        <div>
                                          <span className="text-muted-foreground">Latest Record:</span>
                                          <p className="font-medium">{historicalData[historicalData.length - 1].occupancy_rate}% occupancy</p>
                                        </div>
                                        <div>
                                          <span className="text-muted-foreground">Change:</span>
                                          <p className={`font-medium ${(historicalData[historicalData.length - 1].occupancy_rate - historicalData[0].occupancy_rate) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            {(historicalData[historicalData.length - 1].occupancy_rate - historicalData[0].occupancy_rate) >= 0 ? '+' : ''}
                                            {historicalData[historicalData.length - 1].occupancy_rate - historicalData[0].occupancy_rate}%
                                          </p>
                                        </div>
                                        <div>
                                          <span className="text-muted-foreground">Data Points:</span>
                                          <p className="font-medium">{historicalData.length} days</p>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        </>
                      );
                    })()}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <footer className="mt-8 py-4 border-t bg-white dark:bg-gray-800">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm text-muted-foreground">
          Parking Manager • Property Management Hub
        </div>
      </footer>
    </div>
  );
}
