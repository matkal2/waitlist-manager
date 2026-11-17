'use client';
import { apiFetch } from '@/lib/api-fetch';

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
import { Car, ArrowLeft, User, Key, Shield, LogOut, ParkingCircle, CheckCircle, AlertTriangle, History, Users, Search, Zap, Accessibility, RefreshCw, Download, FileText, Calendar, Undo2, BarChart3, TrendingUp, Target, Building2, Pencil, Layers } from 'lucide-react';
import { ParkingChangeForm, type ChangeFormPrefill } from '@/components/parking-change-form';
import { ParkingReserveForm } from '@/components/parking-reserve-form';
import { ParkingReservationMatches } from '@/components/parking-reservation-matches';
import { ParkingWaitlistTable } from '@/components/parking-waitlist-table';
import { getSpotMatches, normalizeParkingProperty } from '@/lib/parking-matching';
import { exportParkingToPDF } from '@/lib/pdf-export';
import { permissions } from '@/lib/permissions';

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
  moved_out_tenant_name?: string | null;
  move_out_date?: string | null;
  // Reservation info
  reservation_id: string | null;
  reserved_for_applicant: string | null;
  reserved_for_unit: string | null;
  reservation_date: string | null;
  expected_move_in: string | null;
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

// Cache constants for parking data
const PARKING_CACHE_KEY = 'cached_parking_data';
const PARKING_CACHE_EXPIRY_HOURS = 24;

interface ParkingCachedData {
  spots: ParkingSpot[];
  properties: string[];
  lastUpdated: string;
  cachedAt: number;
}

export default function ParkingPage() {
  const { user, loading: authLoading, signOut, userRole } = useAuth();
  const router = useRouter();
  const [spots, setSpots] = useState<ParkingSpot[]>([]);
  const [properties, setProperties] = useState<string[]>([]);
  const [waitlist, setWaitlist] = useState<ParkingWaitlist[]>([]);
  const [waitlistAssign, setWaitlistAssign] = useState<{ entry: ParkingWaitlist; prefill: ChangeFormPrefill } | null>(null);
  const [activityLog, setActivityLog] = useState<ParkingChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [userFullName, setUserFullName] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [isBackgroundRefresh, setIsBackgroundRefresh] = useState(false);
  const [activityFilter, setActivityFilter] = useState<string>('all');
  const [activityDateFrom, setActivityDateFrom] = useState<string>('');
  const [activityDateTo, setActivityDateTo] = useState<string>('');
  const [activitySearch, setActivitySearch] = useState<string>('');
  const [activityMineOnly, setActivityMineOnly] = useState(false);
  
  // Filters
  const [activeTab, setActiveTab] = useState<string>('inventory');
  const [propertyFilter, setPropertyFilter] = useState<string>('');
  const [upcomingProperty, setUpcomingProperty] = useState<string | null>(null);
  const [trackingProperty, setTrackingProperty] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Reserve spot dialog
  const [showReserveForm, setShowReserveForm] = useState(false);
  const [spotToReserve, setSpotToReserve] = useState<ParkingSpot | null>(null);
  const [cancellingReservation, setCancellingReservation] = useState<string | null>(null);
  
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

  // Load cached parking data from localStorage
  const loadFromCache = (): ParkingCachedData | null => {
    if (typeof window === 'undefined') return null;
    try {
      const cached = localStorage.getItem(PARKING_CACHE_KEY);
      if (!cached) return null;
      
      const data: ParkingCachedData = JSON.parse(cached);
      const hoursSinceCached = (Date.now() - data.cachedAt) / (1000 * 60 * 60);
      
      // Return null if cache is expired
      if (hoursSinceCached > PARKING_CACHE_EXPIRY_HOURS) {
        localStorage.removeItem(PARKING_CACHE_KEY);
        return null;
      }
      
      return data;
    } catch {
      return null;
    }
  };

  // Save parking data to localStorage cache
  const saveToCache = (spots: ParkingSpot[], properties: string[], lastUpdated: string) => {
    if (typeof window === 'undefined') return;
    try {
      const cacheData: ParkingCachedData = {
        spots,
        properties,
        lastUpdated,
        cachedAt: Date.now(),
      };
      localStorage.setItem(PARKING_CACHE_KEY, JSON.stringify(cacheData));
    } catch (error) {
      console.error('Failed to save parking cache:', error);
    }
  };

  const fetchData = async (isBackground = false) => {
    try {
      if (!isBackground) {
        setLoading(true);
      } else {
        setIsBackgroundRefresh(true);
      }
      
      // Fetch parking data from Google Sheet API
      const parkingRes = await apiFetch('/api/parking');
      const parkingData = await parkingRes.json();
      
      if (parkingData.success) {
        setSpots(parkingData.spots || []);
        setProperties(parkingData.properties || []);
        setLastUpdated(parkingData.lastUpdated);
        
        // Save to cache for next time
        saveToCache(parkingData.spots || [], parkingData.properties || [], parkingData.lastUpdated);
      }
      
      // Fetch waitlist from Supabase
      const waitlistRes = await supabase.from('parking_waitlist').select('*').order('created_at', { ascending: true });
      if (waitlistRes.data) {
        setWaitlist((waitlistRes.data as ParkingWaitlist[]).map(w => ({ ...w, property: normalizeParkingProperty(w.property) })));
      }
      
      // Fetch activity log from parking_changes
      const activityRes = await apiFetch('/api/parking/change');
      const activityData = await activityRes.json();
      if (activityData.success) {
        setActivityLog(activityData.changes || []);
      }
    } catch (err) {
      console.error('Error fetching parking data:', err);
    } finally {
      setLoading(false);
      setIsBackgroundRefresh(false);
    }
  };

  const cancelReservation = async (reservationId: string) => {
    if (!confirm('Are you sure you want to cancel this reservation?')) return;
    
    setCancellingReservation(reservationId);
    try {
      const cancelledBy = userFullName || user?.email || 'Unknown';
      const response = await apiFetch(`/api/parking/reservations?id=${reservationId}&cancelled_by=${encodeURIComponent(cancelledBy)}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to cancel reservation');
      }
      
      // Refresh data to show updated spot status
      await fetchData(false);
    } catch (error) {
      console.error('Error cancelling reservation:', error);
      alert(error instanceof Error ? error.message : 'Failed to cancel reservation');
    } finally {
      setCancellingReservation(null);
    }
  };

  const fetchHistoricalData = async (property?: string) => {
    setTrendLoading(true);
    try {
      const params = new URLSearchParams({ days: '30' });
      if (property && property !== 'all') {
        params.set('property', property);
      }
      const response = await apiFetch(`/api/parking/snapshot?${params}`);
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
      // Try to load from cache first for instant display
      const cached = loadFromCache();
      if (cached && cached.spots.length > 0) {
        setSpots(cached.spots);
        setProperties(cached.properties);
        setLastUpdated(cached.lastUpdated);
        setLoading(false);
        // Fetch fresh data in background
        fetchData(true);
      } else {
        // No cache, fetch normally
        fetchData(false);
      }
      
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

          const response = await apiFetch('/api/parking/snapshot', {
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
      const response = await apiFetch('/api/parking/change/revert', {
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
      const response = await apiFetch('/api/parking/change/revert', {
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

  // Admins can undo/restore any change; everyone else only their own
  const canModifyChange = (change: ParkingChange) => userRole === 'admin' || isOwnChange(change);

  const isOwnChange = (change: ParkingChange) => {
    const submitter = (change.submitter || '').trim().toLowerCase();
    return !!submitter && [userFullName, user?.email].some(id => id && id.trim().toLowerCase() === submitter);
  };

  const filteredActivity = activityLog.filter(a => {
    if (activityFilter !== 'all' && a.type !== activityFilter) return false;
    if (activityMineOnly && !isOwnChange(a)) return false;
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
  });

  const activityDayLabel = (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
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

  // Demand by property - properties with highest waitlist demand
  const demandByProperty = properties.map(p => {
    const propWaitlist = waitlist.filter(w => w.property === p && w.status === 'Active');
    const propSpots = spots.filter(s => s.property === p);
    const vacantSpots = propSpots.filter(s => s.status === 'Vacant').length;
    const noticeSpots = propSpots.filter(s => s.status === 'Notice').length;
    return {
      property: p,
      waitlistCount: propWaitlist.length,
      vacantCount: vacantSpots,
      noticeCount: noticeSpots,
      demandScore: propWaitlist.length - vacantSpots, // Higher = more demand than supply
    };
  }).sort((a, b) => b.demandScore - a.demandScore);

  // Average wait time calculation (days since created_at for active waitlist entries)
  const avgWaitTime = (() => {
    const activeWaitlist = waitlist.filter(w => w.status === 'Active');
    if (activeWaitlist.length === 0) return 0;
    const totalDays = activeWaitlist.reduce((sum, w) => {
      const created = new Date(w.created_at);
      const now = new Date();
      const days = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
      return sum + days;
    }, 0);
    return Math.round(totalDays / activeWaitlist.length);
  })();

  // Residents holding more than one spot (current or future), across all lots
  const spotsByTenant = new Map<string, string[]>();
  for (const spot of spots) {
    if (spot.tenant_code && !(spot.tenant_name || '').startsWith('(')) {
      spotsByTenant.set(spot.tenant_code, [...(spotsByTenant.get(spot.tenant_code) || []), spot.full_space_code]);
    }
    if (spot.future_tenant_code && spot.future_tenant_code !== spot.tenant_code && !(spot.future_tenant_name || '').startsWith('(')) {
      spotsByTenant.set(spot.future_tenant_code, [...(spotsByTenant.get(spot.future_tenant_code) || []), `${spot.full_space_code} (future)`]);
    }
  }
  const multiSpotIcon = (code: string | null) => {
    const held = code ? spotsByTenant.get(code) : undefined;
    if (!held || held.length < 2) return null;
    return (
      <span title={`Holds ${held.length} spots: ${held.join(', ')}`} className="inline-flex cursor-help items-center gap-0.5 text-indigo-500">
        <Layers className="h-3.5 w-3.5" />
        <span className="text-[10px] font-semibold">{held.length}</span>
      </span>
    );
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
        <div className="max-w-7xl mx-auto px-4 py-3 sm:py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <Button variant="ghost" size="sm" onClick={() => router.push('/')}>
                <ArrowLeft className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Hub</span>
              </Button>
              <img src="/highpoint-logo.png" alt="Highpoint Living" className="hidden h-10 w-auto sm:block" />
              <div className="min-w-0">
                <h1 className="truncate text-lg font-bold text-gray-900 dark:text-white sm:text-2xl">
                  Parking Manager
                </h1>
                <p className="hidden text-sm text-muted-foreground sm:block">
                  Inventory Tracking & Waitlist Management
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <ParkingChangeForm 
                onSubmitSuccess={fetchData}
                submitterName={userFullName || 'Unknown'}
                properties={properties}
                spots={spots}
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <User className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">{userFullName || 'Account'}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>My Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => router.push('/settings')}>
                    <Key className="h-4 w-4 mr-2" />
                    Change Password
                  </DropdownMenuItem>
                  {(permissions.canAccessAdmin(userRole) || user?.email === ADMIN_EMAIL || user?.email === 'matthew.kaleb1763@gmail.com') && (
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
        {/* Quick Stats Dashboard - Only show when no specific property is selected */}
        {(!propertyFilter || propertyFilter === 'all') && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
            <Card className="p-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Car className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <div className="text-xl font-bold">{stats.total}</div>
                  <div className="text-xs text-muted-foreground">Total Spots</div>
                </div>
              </div>
            </Card>
            <Card className="p-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <div className="text-xl font-bold text-green-600">{stats.occupancyRate}%</div>
                  <div className="text-xs text-muted-foreground">Occupancy</div>
                </div>
              </div>
            </Card>
            <Card className="p-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                  <ParkingCircle className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <div className="text-xl font-bold text-blue-600">{stats.vacant}</div>
                  <div className="text-xs text-muted-foreground">Vacant</div>
                </div>
              </div>
            </Card>
            <Card className="p-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30">
                  <AlertTriangle className="h-4 w-4 text-orange-600" />
                </div>
                <div>
                  <div className="text-xl font-bold text-orange-600">{stats.notice}</div>
                  <div className="text-xs text-muted-foreground">On Notice</div>
                </div>
              </div>
            </Card>
            <Card className="p-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                  <Users className="h-4 w-4 text-purple-600" />
                </div>
                <div>
                  <div className="text-xl font-bold text-purple-600">{stats.waitlistTotal}</div>
                  <div className="text-xs text-muted-foreground">On Waitlist</div>
                </div>
              </div>
            </Card>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={(tab) => {
          setActiveTab(tab);
          // Reset to all properties when switching to Tracking tab
          if (tab === 'tracking') {
            setPropertyFilter('all');
          }
        }} className="space-y-4">
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
            <TabsTrigger value="upcoming">
              <span className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Upcoming
                {stats.notice > 0 && (
                  <Badge variant="outline" className="ml-1 bg-orange-50 text-orange-600 border-orange-300">{stats.notice}</Badge>
                )}
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
            {/* Reservation matches alert */}
            <ParkingReservationMatches onConvertSuccess={() => fetchData(false)} />
            
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-4">
                    <div>
                      <CardTitle>Parking Inventory</CardTitle>
                      <CardDescription>
                        {lastUpdated && `Last synced: ${new Date(lastUpdated).toLocaleString()}`}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {propertyFilter && propertyFilter !== 'all' && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => setPropertyFilter('')}
                        title="Back to all properties"
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </Button>
                    )}
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
                    <Button variant="outline" size="sm" onClick={() => fetchData(false)} disabled={loading}>
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
                              {propSpots.length} spots • <span className="text-green-600">{vacant} vacant</span>{notice > 0 && <span className="text-red-500"> • {notice} notice</span>}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Property Stats */}
                    <div className="grid grid-cols-2 gap-3 mb-4 sm:grid-cols-4">
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
                            <TableHead className="w-[100px]">Future</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredSpots.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                                No spots match your filters
                              </TableCell>
                            </TableRow>
                          ) : (
                            filteredSpots.map((spot) => (
                              <TableRow 
                                key={spot.id || spot.full_space_code}
                                className={
                                  spot.status === 'Vacant' ? 'bg-green-50' : 
                                  spot.status === 'Reserved' ? 'bg-amber-50' : ''
                                }
                              >
                                <TableCell className="font-medium">{spot.full_space_code || spot.spot_number || '—'}</TableCell>
                                <TableCell>
                                  <Badge 
                                    variant="outline" 
                                    className={`text-xs ${spot.spot_type === 'Indoor' ? 'bg-white text-black border-gray-300' : ''}`}
                                  >
                                    {spot.spot_type}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <Badge 
                                    variant={
                                      spot.status === 'Occupied' ? 'default' :
                                      spot.status === 'Notice' ? 'destructive' :
                                      'outline'
                                    }
                                    className={`text-xs ${
                                      spot.status === 'Vacant' ? 'bg-green-600 text-white border-green-600 hover:bg-green-700' : 
                                      spot.status === 'Reserved' ? 'bg-amber-600 text-white border-amber-600 hover:bg-amber-700' : ''
                                    }`}
                                  >
                                    {spot.status}
                                  </Badge>
                                </TableCell>
                                <TableCell>${spot.monthly_rent}</TableCell>
                                <TableCell className="text-sm">
                                  {spot.unit_number || <span className="text-muted-foreground">—</span>}
                                </TableCell>
                                <TableCell className="text-sm">
                                  {spot.moved_out_tenant_name && (
                                    <div className="mb-1 text-xs text-muted-foreground" title="Resident is Past in the Directory. A Termination is sent to OUTPUT automatically.">
                                      Moved out: {spot.moved_out_tenant_name}
                                      {spot.move_out_date && ` · ${new Date(spot.move_out_date + 'T00:00:00').toLocaleDateString()}`}
                                    </div>
                                  )}
                                  {spot.tenant_code ? (
                                    <div className="flex items-center gap-2">
                                      <div>
                                        <div className="flex items-center gap-1">
                                          {spot.tenant_name && <span className="font-medium">{spot.tenant_name}</span>}
                                          {multiSpotIcon(spot.tenant_code)}
                                          {spot.status === 'Notice' && (
                                            <Badge variant="outline" className="text-[10px] px-1 py-0 bg-orange-50 text-orange-600 border-orange-300">
                                              Leaving
                                            </Badge>
                                          )}
                                        </div>
                                        <span className="text-muted-foreground text-xs">{spot.tenant_code}</span>
                                        {/* Show reserved applicant info for Notice spots with reservation */}
                                        {spot.status === 'Notice' && spot.reserved_for_applicant && (
                                          <div className="mt-1 flex items-center gap-1">
                                            <span className="text-amber-700 text-xs font-medium">→ {spot.reserved_for_applicant}</span>
                                            <Badge variant="outline" className="text-[10px] px-1 py-0 bg-amber-50 text-amber-600 border-amber-300">
                                              Reserved
                                            </Badge>
                                            {permissions.canCancelReservation(userRole) && (
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-5 w-5 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 ml-1"
                                                onClick={() => spot.reservation_id && cancelReservation(spot.reservation_id)}
                                                disabled={cancellingReservation === spot.reservation_id}
                                                title="Cancel reservation"
                                              >
                                                {cancellingReservation === spot.reservation_id ? (
                                                  <RefreshCw className="h-3 w-3 animate-spin" />
                                                ) : (
                                                  <span className="text-xs">✕</span>
                                                )}
                                              </Button>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                      {spot.status === 'Notice' && !spot.has_future_tenant && !spot.reserved_for_applicant && permissions.canReserveSpot(userRole) && (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="h-6 text-xs text-amber-600 border-amber-300 hover:bg-amber-50 ml-auto"
                                          onClick={() => {
                                            setSpotToReserve(spot);
                                            setShowReserveForm(true);
                                          }}
                                        >
                                          <Calendar className="h-3 w-3 mr-1" />
                                          Reserve
                                        </Button>
                                      )}
                                    </div>
                                  ) : spot.status === 'Reserved' && spot.reserved_for_applicant ? (
                                    <div>
                                      <div className="flex items-center gap-1">
                                        <span className="font-medium text-amber-700">{spot.reserved_for_applicant}</span>
                                        <Badge variant="outline" className="text-[10px] px-1 py-0 bg-amber-50 text-amber-600 border-amber-300">
                                          Applicant
                                        </Badge>
                                        {permissions.canCancelReservation(userRole) && (
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-5 w-5 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 ml-1"
                                            onClick={() => spot.reservation_id && cancelReservation(spot.reservation_id)}
                                            disabled={cancellingReservation === spot.reservation_id}
                                            title="Cancel reservation"
                                          >
                                            {cancellingReservation === spot.reservation_id ? (
                                              <RefreshCw className="h-3 w-3 animate-spin" />
                                            ) : (
                                              <span className="text-xs">✕</span>
                                            )}
                                          </Button>
                                        )}
                                      </div>
                                      <span className="text-muted-foreground text-xs">Unit {spot.reserved_for_unit}</span>
                                    </div>
                                  ) : spot.status === 'Vacant' && !spot.has_future_tenant && permissions.canReserveSpot(userRole) ? (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-7 text-xs text-amber-600 border-amber-300 hover:bg-amber-50"
                                      onClick={() => {
                                        setSpotToReserve(spot);
                                        setShowReserveForm(true);
                                      }}
                                    >
                                      <Calendar className="h-3 w-3 mr-1" />
                                      Reserve
                                    </Button>
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
                                <TableCell className="text-sm">
                                  {spot.has_future_tenant ? (
                                    <div 
                                      className="relative group cursor-pointer"
                                      title={`${spot.future_tenant_name || 'Assigned'}\nUnit: ${spot.future_unit_number || 'N/A'}\nStarts: ${spot.future_start_date ? new Date(spot.future_start_date + 'T00:00:00').toLocaleDateString() : 'TBD'}`}
                                    >
                                      <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-700 border-blue-300 cursor-pointer">
                                        📅 Future
                                      </Badge>
                                      <span className="ml-1 align-middle">{multiSpotIcon(spot.future_tenant_code)}</span>
                                      <div className="absolute z-50 bottom-full left-0 mb-2 hidden group-hover:block w-48 p-2 bg-white border border-blue-200 rounded-lg shadow-lg text-xs">
                                        <div className="flex items-center gap-1 font-semibold text-blue-800">{spot.future_tenant_name || 'Tenant Assigned'}{multiSpotIcon(spot.future_tenant_code)}</div>
                                        {spot.future_unit_number && <div className="text-gray-600">Unit: {spot.future_unit_number}</div>}
                                        <div className="text-blue-600">
                                          Starts: {spot.future_start_date ? new Date(spot.future_start_date + 'T00:00:00').toLocaleDateString() : 'TBD'}
                                        </div>
                                      </div>
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
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <Users className="h-5 w-5 text-amber-600" />
                              <h3 className="font-semibold text-amber-800 dark:text-amber-200">
                                Waitlist for {propertyFilter} ({propertyWaitlist.length})
                              </h3>
                            </div>
                            <Button 
                              variant="outline" 
                              size="sm"
                              className="text-amber-700 border-amber-300 hover:bg-amber-100"
                              onClick={() => setActiveTab('waitlist')}
                            >
                              <Pencil className="h-3 w-3 mr-1" />
                              Edit Waitlist
                            </Button>
                          </div>
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-amber-100/50">
                                <TableHead className="w-8">#</TableHead>
                                <TableHead>Name</TableHead>
                                <TableHead>Unit</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Date Added</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {propertyWaitlist
                                .sort((a, b) => {
                                  const priority: Record<string, number> = { '1st Spot': 1, 'Indoor Upgrade': 2, '2nd Spot': 3 };
                                  const pA = priority[a.waitlist_type] || 3;
                                  const pB = priority[b.waitlist_type] || 3;
                                  if (pA !== pB) return pA - pB;
                                  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
                                })
                                .map((entry, idx) => (
                                  <TableRow key={entry.id} className="bg-white dark:bg-gray-800">
                                    <TableCell className="text-muted-foreground font-medium">{idx + 1}</TableCell>
                                    <TableCell className="font-medium">{entry.tenant_name}</TableCell>
                                    <TableCell>{entry.unit_number}</TableCell>
                                    <TableCell>
                                      <Badge 
                                        className={`text-white ${
                                          entry.waitlist_type === '1st Spot' ? 'bg-purple-500' :
                                          entry.waitlist_type === 'Indoor Upgrade' ? 'bg-teal-500' :
                                          'bg-indigo-400'
                                        }`}
                                      >
                                        {entry.waitlist_type}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">
                                      {new Date(entry.created_at).toLocaleDateString()}
                                    </TableCell>
                                  </TableRow>
                                ))}
                            </TableBody>
                          </Table>
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
                      Click a property to see its waitlist in priority order
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => fetchData(false)} disabled={loading}>
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
                  <>
                  <ParkingWaitlistTable
                    entries={waitlist}
                    properties={properties}
                    onRefresh={fetchData}
                    currentUserEmail={user?.email}
                    spots={spots}
                    submitterName={userFullName || user?.email || 'Unknown'}
                    onAssign={(entry, prefill) => setWaitlistAssign({ entry, prefill })}
                  />
                  {waitlistAssign && (
                    <ParkingChangeForm
                      key={waitlistAssign.entry.id}
                      hideTrigger
                      open
                      onOpenChange={(isOpen) => { if (!isOpen) setWaitlistAssign(null); }}
                      prefill={waitlistAssign.prefill}
                      onSubmitted={async () => {
                        const { error } = await supabase
                          .from('parking_waitlist')
                          .update({ status: 'Assigned' })
                          .eq('id', waitlistAssign.entry.id);
                        if (error) alert(`The change was submitted, but ${waitlistAssign.entry.tenant_name} could not be removed from the waitlist: ${error.message}`);
                      }}
                      onSubmitSuccess={fetchData}
                      submitterName={userFullName || 'Unknown'}
                      properties={properties}
                      spots={spots}
                    />
                  )}
                  </>
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
                        Every parking change, newest first. You can undo or restore your own changes.
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => {
                          const filtered = filteredActivity;
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
                      <Button variant="outline" size="sm" onClick={() => fetchData(false)} disabled={loading}>
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
                      {(activityDateFrom || activityDateTo || activitySearch || activityMineOnly || activityFilter !== 'all') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setActivityDateFrom('');
                            setActivityDateTo('');
                            setActivitySearch('');
                            setActivityMineOnly(false);
                            setActivityFilter('all');
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
                  <div className="space-y-5">
                    {/* Type cards (click to filter) + mine toggle */}
                    <div className="flex flex-wrap items-center gap-2">
                      {[
                        { key: 'all', label: 'All changes' },
                        { key: 'Add', label: 'Add' },
                        { key: 'Termination', label: 'Termination' },
                        { key: 'Transfer', label: 'Transfer' },
                        { key: 'New Lease Signed', label: 'New Lease' },
                      ].map(option => {
                        const count = option.key === 'all' ? activityLog.length : activityLog.filter(a => a.type === option.key).length;
                        const active = activityFilter === option.key;
                        return (
                          <button
                            key={option.key}
                            type="button"
                            onClick={() => setActivityFilter(option.key)}
                            className={`rounded-full border px-3 py-1 text-sm transition ${active ? 'border-blue-600 bg-blue-600 text-white' : 'bg-white dark:bg-gray-900 text-muted-foreground hover:bg-muted hover:text-foreground'}`}
                          >
                            {option.label} <span className={active ? 'text-blue-100' : 'text-muted-foreground'}>{count}</span>
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => setActivityMineOnly(v => !v)}
                        className={`ml-auto rounded-full border px-3 py-1 text-sm transition ${activityMineOnly ? 'border-blue-600 bg-blue-600 text-white' : 'bg-white dark:bg-gray-900 text-muted-foreground hover:bg-muted hover:text-foreground'}`}
                      >
                        <User className="mr-1 inline h-3.5 w-3.5" />
                        My changes only
                      </button>
                    </div>

                    {filteredActivity.length === 0 ? (
                      <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
                        No changes match these filters
                      </div>
                    ) : (
                      Object.entries(
                        filteredActivity.reduce<Record<string, ParkingChange[]>>((groups, a) => {
                          const label = activityDayLabel(a.submission_date);
                          (groups[label] ||= []).push(a);
                          return groups;
                        }, {})
                      ).map(([day, items]) => (
                        <div key={day}>
                          <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                            {day} <span className="font-normal">· {items.length} {items.length === 1 ? 'change' : 'changes'}</span>
                          </h3>
                          <div className="divide-y rounded-xl border bg-white dark:bg-gray-900 shadow-sm">
                            {items.map(activity => {
                              const typeStyle =
                                activity.type === 'Termination' ? 'bg-red-50 text-red-700 border-red-200' :
                                activity.type === 'Add' ? 'bg-green-50 text-green-700 border-green-200' :
                                activity.type === 'Transfer' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                'bg-purple-50 text-purple-700 border-purple-200';
                              return (
                                <div key={activity.id} className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 ${activity.reverted ? 'opacity-60' : ''}`}>
                                  <span className={`w-[110px] shrink-0 rounded-full border px-2 py-0.5 text-center text-xs font-medium ${typeStyle}`}>
                                    {activity.type}
                                  </span>
                                  <div className="min-w-[180px] flex-1">
                                    <div className={`font-medium ${activity.reverted ? 'line-through' : ''}`}>
                                      {activity.tenant_name}
                                      <span className="ml-2 text-sm font-normal text-muted-foreground">{activity.tenant_unit}</span>
                                    </div>
                                    <div className="text-sm text-muted-foreground">
                                      {activity.primary_space}
                                      {activity.transfer_to_space && <> → {activity.transfer_to_space}</>}
                                      <span className="mx-1.5">·</span>
                                      Effective {new Date(activity.effective_date).toLocaleDateString()}
                                    </div>
                                  </div>
                                  <div className="w-[160px] shrink-0 text-sm text-muted-foreground truncate" title={activity.submitter}>
                                    by {activity.submitter}
                                  </div>
                                  <div className="w-[90px] shrink-0">
                                    {activity.reverted ? (
                                      <Badge variant="outline" className="text-orange-600 border-orange-300 bg-orange-50">Undone</Badge>
                                    ) : activity.type === 'Reserve' || activity.type === 'Cancel Reservation' ? (
                                      <Badge variant="outline" className="text-gray-500 border-gray-300" title="Reservations are tracked in the app only and are not synced to the sheet">App only</Badge>
                                    ) : activity.synced_to_sheet ? (
                                      <span className="inline-flex items-center gap-1 text-xs text-green-700" title="Synced to sheet"><CheckCircle className="h-3.5 w-3.5" />In sheet</span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 text-xs text-yellow-700" title="Not synced"><AlertTriangle className="h-3.5 w-3.5" />Not synced</span>
                                    )}
                                  </div>
                                  <div className="w-[90px] shrink-0 text-right">
                                    {!canModifyChange(activity) ? null : !activity.reverted ? (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 px-2 text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                                        onClick={() => handleRevertChange(activity)}
                                        disabled={revertingId === activity.id}
                                        title="Undo this change"
                                      >
                                        {revertingId === activity.id ? (
                                          <RefreshCw className="h-4 w-4 animate-spin" />
                                        ) : (
                                          <><Undo2 className="h-3.5 w-3.5 mr-1" />Undo</>
                                        )}
                                      </Button>
                                    ) : canUndoRevert(activity) ? (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 px-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                        onClick={() => handleUndoRevert(activity)}
                                        disabled={revertingId === activity.id}
                                        title="Restore this change"
                                      >
                                        {revertingId === activity.id ? (
                                          <RefreshCw className="h-4 w-4 animate-spin" />
                                        ) : 'Restore'}
                                      </Button>
                                    ) : null}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))
                    )}
                    <div className="text-sm text-muted-foreground">
                      Showing {filteredActivity.length} of {activityLog.length} entries
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="upcoming">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Upcoming Availability
                </CardTitle>
                <CardDescription>
                  Timeline of parking spots becoming available based on termination dates
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(() => {
                  // Get all spots on Notice with termination dates, sorted by date
                  const allUpcomingSpots = spots
                    .filter(s => s.status === 'Notice' && s.termination_date)
                    .sort((a, b) => new Date(a.termination_date!).getTime() - new Date(b.termination_date!).getTime());
                  const upcomingSpots = upcomingProperty
                    ? allUpcomingSpots.filter(s => s.property === upcomingProperty)
                    : allUpcomingSpots;
                  
                  // Group by month
                  const groupedByMonth: Record<string, ParkingSpot[]> = {};
                  upcomingSpots.forEach(spot => {
                    const date = new Date(spot.termination_date! + 'T00:00:00');
                    const monthKey = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
                    if (!groupedByMonth[monthKey]) groupedByMonth[monthKey] = [];
                    groupedByMonth[monthKey].push(spot);
                  });

                  // Get waitlist matches for a spot
                  // Own-property residents first, then shared-lot residents; type priority, then oldest first
                  const getWaitlistMatches = (spot: ParkingSpot) => getSpotMatches(spot, waitlist);

                  if (allUpcomingSpots.length === 0) {
                    return (
                      <div className="text-center py-12 text-muted-foreground">
                        <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p className="text-lg font-medium">No Upcoming Vacancies</p>
                        <p className="text-sm">There are no spots currently on notice.</p>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-6">
                      {/* Summary cards (selected property, or all properties) */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {[
                          { label: 'Upcoming spots', value: upcomingSpots.length, icon: Calendar, tone: 'text-orange-600', iconBg: 'bg-orange-50 dark:bg-orange-950' },
                          { label: 'Indoor', value: upcomingSpots.filter(s => s.spot_type === 'Indoor').length, icon: Building2, tone: 'text-blue-600', iconBg: 'bg-blue-50 dark:bg-blue-950' },
                          { label: 'Outdoor', value: upcomingSpots.filter(s => s.spot_type === 'Outdoor').length, icon: Car, tone: 'text-green-600', iconBg: 'bg-green-50 dark:bg-green-950' },
                          { label: 'With waitlist match', value: upcomingSpots.filter(s => getWaitlistMatches(s).length > 0).length, icon: Users, tone: 'text-purple-600', iconBg: 'bg-purple-50 dark:bg-purple-950' },
                        ].map(card => {
                          const Icon = card.icon;
                          return (
                            <div key={card.label} className="flex items-center gap-4 rounded-xl border bg-white dark:bg-gray-900 p-4 shadow-sm">
                              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${card.iconBg}`}>
                                <Icon className={`h-5 w-5 ${card.tone}`} />
                              </div>
                              <div>
                                <div className="text-2xl font-semibold tabular-nums leading-tight">{card.value}</div>
                                <div className="text-sm text-muted-foreground">{card.label}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Property tiles: click to open, click again to close */}
                      <div>
                        <h3 className="mb-2 text-sm font-medium text-muted-foreground">Properties</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3">
                          {properties.map(prop => {
                            const propUpcoming = allUpcomingSpots.filter(s => s.property === prop);
                            const matched = propUpcoming.filter(s => getWaitlistMatches(s).length > 0).length;
                            const active = upcomingProperty === prop;
                            return (
                              <button
                                key={prop}
                                type="button"
                                onClick={() => setUpcomingProperty(active ? null : prop)}
                                className={`flex flex-col items-center rounded-xl border px-3 py-4 text-center shadow-sm transition-all ${active ? 'border-blue-600 bg-blue-600 text-white shadow-md' : 'bg-white dark:bg-gray-900 hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md'} border-t-4 ${active ? 'border-t-blue-600' : propUpcoming.length > 0 ? 'border-t-blue-500' : 'border-t-gray-200 dark:border-t-gray-700'} ${propUpcoming.length === 0 && !active ? 'opacity-60' : ''}`}
                              >
                                <span className={`max-w-full truncate text-sm font-medium ${active ? 'text-blue-50' : 'text-muted-foreground'}`} title={prop}>{prop}</span>
                                <span className={`mt-2 text-4xl font-bold tabular-nums leading-none ${active ? 'text-white' : propUpcoming.length > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`}>{propUpcoming.length}</span>
                                <span className={`mt-1 text-xs ${active ? 'text-blue-100' : 'text-muted-foreground'}`}>upcoming</span>
                                <span className={`mt-3 inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium ${matched > 0 ? (active ? 'bg-white/20 text-white' : 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300') : (active ? 'text-blue-100' : 'text-muted-foreground')}`}>
                                  {matched > 0 ? `${matched} with match` : 'No matches'}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {upcomingProperty && (
                        <div className="flex items-center justify-between">
                          <h3 className="text-lg font-semibold">
                            {upcomingProperty}
                            <span className="ml-2 text-sm font-normal text-muted-foreground">
                              {upcomingSpots.length} upcoming {upcomingSpots.length === 1 ? 'spot' : 'spots'} · soonest first
                            </span>
                          </h3>
                          <Button variant="ghost" size="sm" onClick={() => setUpcomingProperty(null)}>Close</Button>
                        </div>
                      )}

                      {/* Timeline by Month */}
                      {!upcomingProperty ? (
                        <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
                          Select a property above to see its upcoming spots and waitlist matches.
                        </div>
                      ) : upcomingSpots.length === 0 ? (
                        <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
                          No spots on notice at {upcomingProperty}.
                        </div>
                      ) : Object.entries(groupedByMonth).map(([month, monthSpots]) => (
                        <div key={month} className="border rounded-lg overflow-hidden">
                          <div className="bg-muted/50 px-4 py-2 font-semibold flex items-center justify-between">
                            <span>{month}</span>
                            <Badge variant="secondary">{monthSpots.length} spot{monthSpots.length !== 1 ? 's' : ''}</Badge>
                          </div>
                          <div className="divide-y">
                            {monthSpots.map(spot => {
                              const matches = getWaitlistMatches(spot);
                              const availDate = new Date(spot.termination_date! + 'T00:00:00');
                              availDate.setDate(availDate.getDate() + 1);
                              
                              return (
                                <div key={spot.id} className="p-4 hover:bg-muted/30 transition-colors">
                                  <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className="font-medium">{spot.full_space_code}</span>
                                        <Badge variant={spot.spot_type === 'Indoor' ? 'default' : 'outline'} className="text-xs">
                                          {spot.spot_type}
                                        </Badge>
                                        <span className="text-sm text-muted-foreground">${spot.monthly_rent}/mo</span>
                                      </div>
                                      <div className="text-sm text-muted-foreground">
                                        <span className="text-orange-600 font-medium">
                                          Available: {availDate.toLocaleDateString()}
                                        </span>
                                        {spot.tenant_name && (
                                          <span className="ml-2">• Current: {spot.tenant_name}</span>
                                        )}
                                      </div>
                                    </div>
                                    <div className="text-right flex items-center gap-2">
                                      {matches.length > 0 ? (
                                        <DropdownMenu>
                                          <DropdownMenuTrigger asChild>
                                            <Button variant="outline" size="sm" className="h-7 bg-green-50 text-green-700 border-green-300 hover:bg-green-100">
                                              <Users className="h-3 w-3 mr-1" />
                                              {matches.length} match{matches.length !== 1 ? 'es' : ''}
                                            </Button>
                                          </DropdownMenuTrigger>
                                          <DropdownMenuContent align="end" className="w-64">
                                            <DropdownMenuLabel className="text-xs text-muted-foreground">
                                              Assign to {spot.full_space_code} (available {availDate.toLocaleDateString()})
                                            </DropdownMenuLabel>
                                            <DropdownMenuSeparator />
                                            {matches.map(match => (
                                              <DropdownMenuItem 
                                                key={match.id}
                                                className="flex flex-col items-start py-2 cursor-pointer"
                                                onClick={() => {
                                                  const confirmed = confirm(
                                                    `Assign ${match.tenant_name} to ${spot.full_space_code}?\n\n` +
                                                    `This will open the Change Form pre-filled with:\n` +
                                                    `• Tenant: ${match.tenant_name}\n` +
                                                    `• Unit: ${match.unit_number || 'N/A'}\n` +
                                                    `• Space: ${spot.full_space_code}\n` +
                                                    `• Effective Date: ${availDate.toLocaleDateString()}`
                                                  );
                                                  if (confirmed) {
                                                    alert(
                                                      `To complete this assignment:\n\n` +
                                                      `1. Click "Parking Change" button in header\n` +
                                                      `2. Select "Add" as change type\n` +
                                                      `3. Enter: ${match.tenant_name}\n` +
                                                      `4. Unit: ${match.unit_number || 'Enter unit'}\n` +
                                                      `5. Space: ${spot.full_space_code}\n` +
                                                      `6. Date: ${availDate.toLocaleDateString()}\n\n` +
                                                      `Then update the waitlist entry status to "Assigned".`
                                                    );
                                                  }
                                                }}
                                              >
                                                <span className="font-medium">{match.tenant_name}</span>
                                                <span className="text-xs text-muted-foreground">
                                                  {match.property !== spot.property && `${match.property} resident • `}{match.unit_number || 'No unit'} • {match.waitlist_type} • Since {new Date(match.created_at).toLocaleDateString()}
                                                </span>
                                              </DropdownMenuItem>
                                            ))}
                                          </DropdownMenuContent>
                                        </DropdownMenu>
                                      ) : (
                                        <Badge variant="outline" className="text-muted-foreground">
                                          No waitlist match
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                  {spot.has_future_tenant && spot.future_tenant_name && (
                                    <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-sm">
                                      <span className="text-blue-700 font-medium">Already assigned to: </span>
                                      <span className="text-blue-600">{spot.future_tenant_name}</span>
                                      {spot.future_start_date && (
                                        <span className="text-blue-500 text-xs ml-2">
                                          (starts {new Date(spot.future_start_date + 'T00:00:00').toLocaleDateString()})
                                        </span>
                                      )}
                                    </div>
                                  )}
                                  {spot.reserved_for_applicant && (
                                    <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-sm">
                                      <span className="text-amber-700 font-medium">Reserved for: </span>
                                      <span className="text-amber-600">{spot.reserved_for_applicant}</span>
                                      {spot.reserved_for_unit && (
                                        <span className="text-amber-600"> (Unit {spot.reserved_for_unit})</span>
                                      )}
                                      {spot.expected_move_in && (
                                        <span className="text-amber-500 text-xs ml-2">
                                          (expected move-in {new Date(spot.expected_move_in + 'T00:00:00').toLocaleDateString()})
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
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
                    <Button variant="outline" size="sm" onClick={() => fetchData(false)} disabled={loading}>
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
                      const filteredForTracking = trackingProperty !== 'all' 
                        ? spots.filter(s => s.property === trackingProperty)
                        : spots;
                      const waitlistFiltered = trackingProperty !== 'all'
                        ? waitlist.filter(w => w.property === trackingProperty && w.status === 'Active')
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
                          {/* Property tiles: click to focus a property, click again for all */}
                          <div>
                            <h3 className="mb-2 text-sm font-medium text-muted-foreground">Properties</h3>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3">
                              {properties.map(prop => {
                                const propSpots = spots.filter(s => s.property === prop);
                                const propOccupied = propSpots.filter(s => s.status === 'Occupied').length;
                                const propVacant = propSpots.filter(s => s.status === 'Vacant').length;
                                const propNotice = propSpots.filter(s => s.status === 'Notice').length;
                                // Occupancy: (Occupied + Notice) / (Occupied + Vacant + Notice) - excludes Reserved/Future
                                const propActiveSpots = propOccupied + propVacant + propNotice;
                                const propOccupancy = propActiveSpots > 0 ? Math.round(((propOccupied + propNotice) / propActiveSpots) * 100) : 0;
                                const propWaitlist = waitlist.filter(w => w.property === prop && w.status === 'Active').length;
                                const active = trackingProperty === prop;
                                return (
                                  <button
                                    key={prop}
                                    type="button"
                                    onClick={() => setTrackingProperty(active ? 'all' : prop)}
                                    className={`flex flex-col items-center rounded-xl border px-3 py-4 text-center shadow-sm transition-all ${active ? 'border-blue-600 bg-blue-600 text-white shadow-md' : 'bg-white dark:bg-gray-900 hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md'}`}
                                  >
                                    <span className={`max-w-full truncate text-sm font-medium ${active ? 'text-blue-50' : 'text-muted-foreground'}`} title={prop}>{prop}</span>
                                    <span className={`mt-2 text-4xl font-bold tabular-nums leading-none ${active ? 'text-white' : propOccupancy >= 90 ? 'text-green-700 dark:text-green-400' : propOccupancy >= 70 ? 'text-yellow-700 dark:text-yellow-400' : 'text-red-700 dark:text-red-400'}`}>{propOccupancy}%</span>
                                    <span className={`mt-1 text-xs ${active ? 'text-blue-100' : 'text-muted-foreground'}`}>occupied · {propSpots.length} spots</span>
                                    <span className={`mt-2 text-xs ${active ? 'text-blue-100' : 'text-muted-foreground'}`}>{propVacant} vacant · {propNotice} notice</span>
                                    <span className={`mt-2 inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium ${propWaitlist > 0 ? (active ? 'bg-white/20 text-white' : 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300') : (active ? 'text-blue-100' : 'text-muted-foreground')}`}>
                                      {propWaitlist > 0 ? `${propWaitlist} on waitlist` : 'No waitlist'}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold">
                              {trackingProperty === 'all' ? 'All properties' : trackingProperty}
                              {trackingProperty === 'all' && (
                                <span className="ml-2 text-sm font-normal text-muted-foreground">Select a property above to focus on it</span>
                              )}
                            </h3>
                            {trackingProperty !== 'all' && (
                              <Button variant="ghost" size="sm" onClick={() => setTrackingProperty('all')}>Show all</Button>
                            )}
                          </div>

                          {/* Main KPI cards */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {[
                              { label: 'Total spots', value: `${totalSpots}`, sub: `${indoorSpots.length} indoor · ${outdoorSpots.length} outdoor`, icon: ParkingCircle, tone: 'text-blue-600', iconBg: 'bg-blue-50 dark:bg-blue-950' },
                              { label: 'Occupancy rate', value: `${occupancyRate}%`, sub: `${occupiedSpots} of ${totalSpots} occupied`, icon: TrendingUp, tone: occupancyRate >= 90 ? 'text-green-600' : occupancyRate >= 70 ? 'text-yellow-600' : 'text-red-600', iconBg: occupancyRate >= 90 ? 'bg-green-50 dark:bg-green-950' : occupancyRate >= 70 ? 'bg-yellow-50 dark:bg-yellow-950' : 'bg-red-50 dark:bg-red-950' },
                              { label: 'Available now', value: `${vacantSpots}`, sub: `${indoorVacant} indoor · ${outdoorVacant} outdoor`, icon: CheckCircle, tone: 'text-orange-600', iconBg: 'bg-orange-50 dark:bg-orange-950' },
                              { label: 'Upcoming vacancy', value: `${noticeSpots}`, sub: 'On notice / terminating', icon: Calendar, tone: 'text-purple-600', iconBg: 'bg-purple-50 dark:bg-purple-950' },
                            ].map(card => {
                              const Icon = card.icon;
                              return (
                                <div key={card.label} className="flex items-center gap-4 rounded-xl border bg-white dark:bg-gray-900 p-4 shadow-sm">
                                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${card.iconBg}`}>
                                    <Icon className={`h-5 w-5 ${card.tone}`} />
                                  </div>
                                  <div>
                                    <div className="text-2xl font-semibold tabular-nums leading-tight">{card.value}</div>
                                    <div className="text-sm text-muted-foreground">{card.label}</div>
                                    <div className="text-xs text-muted-foreground">{card.sub}</div>
                                  </div>
                                </div>
                              );
                            })}
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
                                  onClick={() => fetchHistoricalData(trackingProperty)}
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

      {/* Reserve Spot Dialog */}
      <ParkingReserveForm
        spot={spotToReserve}
        spots={spots}
        open={showReserveForm}
        onOpenChange={setShowReserveForm}
        onSuccess={() => fetchData(false)}
        reservedBy={userFullName || user?.email || 'Unknown'}
      />
    </div>
  );
}
