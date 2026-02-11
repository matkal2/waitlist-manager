'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Download, 
  RefreshCw, 
  Users, 
  UserPlus, 
  Globe, 
  Target, 
  Calendar,
  CheckCircle,
  FileText,
  TrendingUp
} from 'lucide-react';

interface ReportMetrics {
  totalEntries: number;
  agentEntries: number;
  selfEntries: number;
  matchedCount: number;
  toursScheduled: number;
  applied: number;
  leaseSigned: number;
}

interface ReportData {
  ytd: {
    label: string;
    range: string;
    metrics: ReportMetrics;
  };
  week: {
    label: string;
    range: string;
    metrics: ReportMetrics;
  };
  funnel: {
    active: number;
    matched: number;
    touring: number;
    applied: number;
    leased: number;
    declined: number;
    removed: number;
  };
  byProperty: Record<string, { total: number; self: number; agent: number }>;
  totalEntries: number;
}

export function WaitlistReports() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReports = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/waitlist/reports');
      if (!response.ok) throw new Error('Failed to fetch reports');
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const exportToCSV = () => {
    if (!data) return;

    const rows = [
      ['Waitlist Manager Report'],
      ['Generated', new Date().toLocaleString()],
      [''],
      ['YTD METRICS', data.ytd.range],
      ['Total Entries Added', data.ytd.metrics.totalEntries],
      ['Agent-Added Entries', data.ytd.metrics.agentEntries],
      ['Self-Added Entries', data.ytd.metrics.selfEntries],
      ['Unit Matches', data.ytd.metrics.matchedCount],
      ['Tours Scheduled', data.ytd.metrics.toursScheduled],
      ['Applications', data.ytd.metrics.applied],
      ['Leases Signed', data.ytd.metrics.leaseSigned],
      [''],
      ['THIS WEEK', data.week.range],
      ['Total Entries Added', data.week.metrics.totalEntries],
      ['Agent-Added Entries', data.week.metrics.agentEntries],
      ['Self-Added Entries', data.week.metrics.selfEntries],
      ['Unit Matches', data.week.metrics.matchedCount],
      ['Tours Scheduled', data.week.metrics.toursScheduled],
      ['Applications', data.week.metrics.applied],
      ['Leases Signed', data.week.metrics.leaseSigned],
      [''],
      ['FUNNEL STATUS'],
      ['Active', data.funnel.active],
      ['Matched', data.funnel.matched],
      ['Touring', data.funnel.touring],
      ['Applied', data.funnel.applied],
      ['Leased', data.funnel.leased],
      ['Declined', data.funnel.declined],
      ['Removed', data.funnel.removed],
      [''],
      ['BY PROPERTY', 'Total', 'Self-Added', 'Agent-Added'],
      ...Object.entries(data.byProperty).map(([prop, stats]) => [
        prop, stats.total, stats.self, stats.agent
      ]),
    ];

    const csvContent = rows.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `waitlist-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <span className="ml-3 text-muted-foreground">Loading reports...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="pt-6">
          <p className="text-red-600">{error || 'Failed to load reports'}</p>
          <Button variant="outline" onClick={fetchReports} className="mt-2">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Performance Reports</h2>
          <p className="text-sm text-muted-foreground">
            Weekly period: Friday - Thursday | YTD: Jan 1 - Dec 31
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchReports} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={exportToCSV}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* YTD Stats */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-blue-600" />
              {data.ytd.label}
            </CardTitle>
            <Badge variant="outline">{data.ytd.range}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <MetricCard 
              icon={<Users className="h-4 w-4" />}
              label="Total Entries"
              value={data.ytd.metrics.totalEntries}
              color="blue"
            />
            <MetricCard 
              icon={<UserPlus className="h-4 w-4" />}
              label="Agent Added"
              value={data.ytd.metrics.agentEntries}
              color="purple"
            />
            <MetricCard 
              icon={<Globe className="h-4 w-4" />}
              label="Self Added"
              value={data.ytd.metrics.selfEntries}
              color="green"
            />
            <MetricCard 
              icon={<Target className="h-4 w-4" />}
              label="Matches"
              value={data.ytd.metrics.matchedCount}
              color="amber"
            />
            <MetricCard 
              icon={<Calendar className="h-4 w-4" />}
              label="Tours"
              value={data.ytd.metrics.toursScheduled}
              color="cyan"
            />
            <MetricCard 
              icon={<FileText className="h-4 w-4" />}
              label="Applied"
              value={data.ytd.metrics.applied}
              color="orange"
            />
            <MetricCard 
              icon={<CheckCircle className="h-4 w-4" />}
              label="Leased"
              value={data.ytd.metrics.leaseSigned}
              color="emerald"
            />
          </div>
        </CardContent>
      </Card>

      {/* Weekly Stats */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5 text-purple-600" />
              {data.week.label}
            </CardTitle>
            <Badge variant="outline">{data.week.range}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <MetricCard 
              icon={<Users className="h-4 w-4" />}
              label="Total Entries"
              value={data.week.metrics.totalEntries}
              color="blue"
            />
            <MetricCard 
              icon={<UserPlus className="h-4 w-4" />}
              label="Agent Added"
              value={data.week.metrics.agentEntries}
              color="purple"
            />
            <MetricCard 
              icon={<Globe className="h-4 w-4" />}
              label="Self Added"
              value={data.week.metrics.selfEntries}
              color="green"
            />
            <MetricCard 
              icon={<Target className="h-4 w-4" />}
              label="Matches"
              value={data.week.metrics.matchedCount}
              color="amber"
            />
            <MetricCard 
              icon={<Calendar className="h-4 w-4" />}
              label="Tours"
              value={data.week.metrics.toursScheduled}
              color="cyan"
            />
            <MetricCard 
              icon={<FileText className="h-4 w-4" />}
              label="Applied"
              value={data.week.metrics.applied}
              color="orange"
            />
            <MetricCard 
              icon={<CheckCircle className="h-4 w-4" />}
              label="Leased"
              value={data.week.metrics.leaseSigned}
              color="emerald"
            />
          </div>
        </CardContent>
      </Card>

      {/* Funnel Overview */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Current Funnel Status</CardTitle>
            <CardDescription>All entries by outcome stage</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <FunnelBar label="Active" value={data.funnel.active} total={data.totalEntries} color="bg-blue-500" />
              <FunnelBar label="Matched" value={data.funnel.matched} total={data.totalEntries} color="bg-amber-500" />
              <FunnelBar label="Touring" value={data.funnel.touring} total={data.totalEntries} color="bg-cyan-500" />
              <FunnelBar label="Applied" value={data.funnel.applied} total={data.totalEntries} color="bg-orange-500" />
              <FunnelBar label="Leased" value={data.funnel.leased} total={data.totalEntries} color="bg-emerald-500" />
              <FunnelBar label="Declined" value={data.funnel.declined} total={data.totalEntries} color="bg-red-400" />
              <FunnelBar label="Removed" value={data.funnel.removed} total={data.totalEntries} color="bg-gray-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">By Property</CardTitle>
            <CardDescription>Entry source breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[250px] overflow-y-auto">
              {Object.entries(data.byProperty)
                .sort((a, b) => b[1].total - a[1].total)
                .map(([property, stats]) => (
                  <div key={property} className="flex items-center justify-between py-1 border-b last:border-0">
                    <span className="font-medium text-sm">{property}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {stats.total} total
                      </Badge>
                      <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-700">
                        {stats.agent} agent
                      </Badge>
                      <Badge variant="secondary" className="text-xs bg-green-100 text-green-700">
                        {stats.self} self
                      </Badge>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({ 
  icon, 
  label, 
  value, 
  color 
}: { 
  icon: React.ReactNode; 
  label: string; 
  value: number; 
  color: string;
}) {
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    cyan: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  };

  return (
    <div className={`p-3 rounded-lg border ${colorClasses[color]}`}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

function FunnelBar({ 
  label, 
  value, 
  total, 
  color 
}: { 
  label: string; 
  value: number; 
  total: number; 
  color: string;
}) {
  const percentage = total > 0 ? (value / total) * 100 : 0;
  
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm w-20">{label}</span>
      <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
        <div 
          className={`h-full ${color} transition-all`}
          style={{ width: `${Math.max(percentage, 0)}%` }}
        />
      </div>
      <span className="text-sm font-medium w-12 text-right">{value}</span>
    </div>
  );
}
