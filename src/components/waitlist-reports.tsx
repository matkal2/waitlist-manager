'use client';
import { apiFetch } from '@/lib/api-fetch';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, RefreshCw, UserPlus, Sparkles, CalendarCheck, FileSignature, ChevronRight, X } from 'lucide-react';
import { getCurrentWeekRange, getPreviousWeekRange, getYTDRange, formatDateRange, type DateRange } from '@/lib/date-utils';
import type { ReportRecord } from '@/lib/waitlist-report-history';

interface ReportResponse {
  records: ReportRecord[];
  archivedCount: number;
  deletedCount: number;
}

type Period = 'week' | 'lastWeek' | 'month' | 'ytd';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'week', label: 'This week' },
  { key: 'lastWeek', label: 'Last week' },
  { key: 'month', label: 'This month' },
  { key: 'ytd', label: 'Year to date' },
];

function getPeriodRange(period: Period): DateRange {
  if (period === 'week') return getCurrentWeekRange();
  if (period === 'lastWeek') return getPreviousWeekRange();
  if (period === 'ytd') return getYTDRange();
  const now = new Date();
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
  };
}

const inRange = (date: string | null, range: DateRange) => {
  if (!date) return false;
  const d = new Date(date);
  return d >= range.start && d <= range.end;
};

const OUTCOME_RANK: Record<string, number> = { matched: 1, touring: 2, applied: 3, leased: 4 };

// Furthest stage reached: 1 matched, 2 toured, 3 applied, 4 leased
function stageReached(r: ReportRecord): number {
  const fromDates = r.lease_signed_at ? 4 : r.applied_at ? 3 : r.tour_scheduled_at ? 2 : r.matched_at ? 1 : 0;
  return Math.max(fromDates, OUTCOME_RANK[r.outcome_status || ''] || 0);
}

function getMetrics(records: ReportRecord[], range: DateRange) {
  const added = records.filter(r => inRange(r.created_at, range));
  return {
    added: added.length,
    selfAdded: added.filter(r => r.entry_source === 'self').length,
    matched: records.filter(r => inRange(r.matched_at, range)).length,
    tours: records.filter(r => inRange(r.tour_scheduled_at, range)).length,
    applied: records.filter(r => inRange(r.applied_at, range)).length,
    leased: records.filter(r => inRange(r.lease_signed_at, range)).length,
    cohort: added,
  };
}

export function WaitlistReports() {
  const [data, setData] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>('week');
  const [property, setProperty] = useState<string | null>(null);

  const fetchReports = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch('/api/waitlist/reports');
      if (!response.ok) throw new Error('Failed to fetch reports');
      setData(await response.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const range = useMemo(() => getPeriodRange(period), [period]);
  const records = useMemo(() => data?.records || [], [data]);
  const properties = useMemo(
    () => [...new Set(records.map(r => r.property).filter((p): p is string => !!p))].sort(),
    [records]
  );
  const filtered = useMemo(
    () => (property ? records.filter(r => r.property === property) : records),
    [records, property]
  );
  const metrics = useMemo(() => getMetrics(filtered, range), [filtered, range]);

  const funnel = useMemo(() => {
    const steps = [
      { label: 'Added', value: metrics.cohort.length },
      { label: 'Matched', value: metrics.cohort.filter(r => stageReached(r) >= 1).length },
      { label: 'Toured', value: metrics.cohort.filter(r => stageReached(r) >= 2).length },
      { label: 'Applied', value: metrics.cohort.filter(r => stageReached(r) >= 3).length },
      { label: 'Leased', value: metrics.cohort.filter(r => stageReached(r) >= 4).length },
    ];
    return {
      steps,
      declined: metrics.cohort.filter(r => r.outcome_status === 'declined').length,
      removed: metrics.cohort.filter(r => r.outcome_status === 'removed').length,
    };
  }, [metrics]);

  const propertyStats = useMemo(
    () =>
      properties.map(name => {
        const m = getMetrics(records.filter(r => r.property === name), range);
        return { name, added: m.added, matched: m.matched, leased: m.leased };
      }),
    [properties, records, range]
  );

  const periodLabel = PERIODS.find(p => p.key === period)!.label;

  const exportToCSV = () => {
    const rows: (string | number)[][] = [
      ['Waitlist Manager Report'],
      ['Generated', new Date().toLocaleString()],
      ['Period', `${periodLabel} (${formatDateRange(range)})`],
      ['Property', property || 'All properties'],
      [],
      ['Entries added', metrics.added],
      ['Agent-added', metrics.added - metrics.selfAdded],
      ['Self sign-ups', metrics.selfAdded],
      ['Unit matches', metrics.matched],
      ['Tours scheduled', metrics.tours],
      ['Applications', metrics.applied],
      ['Leases signed', metrics.leased],
      [],
      ['FUNNEL (entries added this period)'],
      ...funnel.steps.map(s => [s.label, s.value]),
      ['Declined', funnel.declined],
      ['Removed', funnel.removed],
      [],
      ['BY PROPERTY', 'Added', 'Matched', 'Leased'],
      ...propertyStats.map(p => [p.name, p.added, p.matched, p.leased]),
    ];
    const csv = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `waitlist-report-${period}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <span className="ml-3 text-muted-foreground">Loading reports...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6">
        <p className="text-red-600">{error || 'No report data'}</p>
        <Button variant="outline" onClick={fetchReports} className="mt-2">
          Try Again
        </Button>
      </div>
    );
  }

  const cards = [
    { label: 'Entries added', value: metrics.added, sub: `${metrics.added - metrics.selfAdded} by agents · ${metrics.selfAdded} self sign-up`, icon: UserPlus, tone: 'text-blue-600', iconBg: 'bg-blue-50 dark:bg-blue-950' },
    { label: 'Unit matches', value: metrics.matched, icon: Sparkles, tone: 'text-green-600', iconBg: 'bg-green-50 dark:bg-green-950' },
    { label: 'Tours scheduled', value: metrics.tours, sub: `${metrics.applied} application${metrics.applied === 1 ? '' : 's'}`, icon: CalendarCheck, tone: 'text-cyan-600', iconBg: 'bg-cyan-50 dark:bg-cyan-950' },
    { label: 'Leases signed', value: metrics.leased, icon: FileSignature, tone: 'text-emerald-600', iconBg: 'bg-emerald-50 dark:bg-emerald-950' },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Performance Reports</h2>
          <p className="text-sm text-muted-foreground">
            {formatDateRange(range)}
            {period.endsWith('eek') && ' (Fri – Thu)'} · {property || 'All properties'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border bg-white dark:bg-gray-900 p-1 shadow-sm">
            {PERIODS.map(p => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPeriod(p.key)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  period === p.key ? 'bg-blue-600 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={fetchReports} disabled={loading} title="Refresh">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button size="sm" onClick={exportToCSV}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Headline cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(card => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="flex items-center gap-4 rounded-xl border bg-white dark:bg-gray-900 p-4 shadow-sm">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${card.iconBg}`}>
                <Icon className={`h-5 w-5 ${card.tone}`} />
              </div>
              <div className="min-w-0">
                <div className="text-2xl font-semibold tabular-nums leading-tight">{card.value}</div>
                <div className="text-sm text-muted-foreground">{card.label}</div>
                {card.sub && <div className="text-xs text-muted-foreground truncate">{card.sub}</div>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Funnel */}
      <div className="rounded-xl border bg-white dark:bg-gray-900 p-4 shadow-sm">
        <div className="mb-3">
          <h3 className="font-semibold">Funnel</h3>
          <p className="text-sm text-muted-foreground">How far the people added {periodLabel.toLowerCase()} have progressed</p>
        </div>
        <div className="flex flex-wrap items-stretch gap-2">
          {funnel.steps.map((step, i) => {
            const prev = i > 0 ? funnel.steps[i - 1].value : 0;
            const pct = i > 0 && prev > 0 ? Math.round((step.value / prev) * 100) : null;
            return (
              <div key={step.label} className="flex flex-1 items-center gap-2 min-w-[120px]">
                {i > 0 && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                <div className="flex flex-1 flex-col items-center rounded-lg bg-gray-50 dark:bg-gray-800 px-3 py-3 text-center">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{step.label}</span>
                  <span className="mt-1 text-2xl font-bold tabular-nums">{step.value}</span>
                  <span className="text-xs text-muted-foreground">{i === 0 ? 'people' : pct === null ? '–' : `${pct}% of ${funnel.steps[i - 1].label.toLowerCase()}`}</span>
                </div>
              </div>
            );
          })}
        </div>
        {(funnel.declined > 0 || funnel.removed > 0) && (
          <p className="mt-3 text-xs text-muted-foreground">
            {funnel.declined} declined · {funnel.removed} removed
          </p>
        )}
      </div>

      {/* Property tiles */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold">By property</h3>
          {property && (
            <Button variant="ghost" size="sm" onClick={() => setProperty(null)}>
              <X className="h-4 w-4 mr-1" />
              Show all properties
            </Button>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {propertyStats.map(p => {
            const active = property === p.name;
            return (
              <button
                key={p.name}
                type="button"
                onClick={() => setProperty(active ? null : p.name)}
                className={`flex flex-col items-center rounded-xl border px-3 py-4 text-center shadow-sm transition-all ${
                  active
                    ? 'border-blue-600 bg-blue-600 text-white shadow-md'
                    : 'bg-white dark:bg-gray-900 hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md'
                }`}
              >
                <span className="text-sm font-medium leading-tight">{p.name}</span>
                <span className={`mt-2 text-3xl font-bold tabular-nums leading-none ${active ? 'text-white' : 'text-gray-900 dark:text-gray-50'}`}>
                  {p.added}
                </span>
                <span className={`mt-1 text-xs ${active ? 'text-blue-100' : 'text-muted-foreground'}`}>added</span>
                <span className={`mt-2 text-xs ${active ? 'text-blue-100' : 'text-muted-foreground'}`}>
                  {p.matched} matched · {p.leased} leased
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Includes {data.archivedCount} archived and {data.deletedCount} permanently deleted entr{data.deletedCount === 1 ? 'y' : 'ies'}.
      </p>
    </div>
  );
}
