'use client';

import { useEffect, useRef, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  TrendingUp,
  Eye,
  Heart,
  Share2,
  MessageCircle,
  Download,
  RefreshCw,
  Calendar,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  analyticsApi,
  type AnalyticsOverview,
  type HistoricalDataPoint,
} from '@/lib/api/content';

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8001';

// ─── Date helpers ─────────────────────────────────────────────────────────────

function toDateString(d: Date): string {
  return d.toISOString().split('T')[0];
}

function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return { from: toDateString(from), to: toDateString(to) };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [historical, setHistorical] = useState<HistoricalDataPoint[]>([]);
  const [dateRange, setDateRange] = useState(defaultRange());
  const [loading, setLoading] = useState(true);
  const [histLoading, setHistLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const sseRef = useRef<EventSource | null>(null);

  // ─── Real-time via SSE ──────────────────────────────────────────────────────
  useEffect(() => {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) return;

    // Use SSE for live updates; fall back gracefully if server does not support it
    const es = new EventSource(
      `${BACKEND_URL}/api/analytics/realtime?token=${encodeURIComponent(token)}`,
    );
    sseRef.current = es;

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as AnalyticsOverview;
        setOverview(data);
        setLastRefreshed(new Date());
      } catch {
        // ignore malformed frames
      }
    };

    es.onerror = () => {
      // SSE not yet active — fall through to normal HTTP fetch below
      es.close();
    };

    return () => {
      es.close();
    };
  }, []);

  // ─── Initial data load ──────────────────────────────────────────────────────
  useEffect(() => {
    fetchOverview();
    fetchHistorical();
  }, []);

  useEffect(() => {
    fetchHistorical();
  }, [dateRange]);

  const fetchOverview = async () => {
    try {
      setLoading(true);
      const { data } = await analyticsApi.getOverview();
      setOverview(data);
      setLastRefreshed(new Date());
    } catch {
      toast.error('Error loading analytics overview');
    } finally {
      setLoading(false);
    }
  };

  const fetchHistorical = async () => {
    try {
      setHistLoading(true);
      const { data } = await analyticsApi.getHistorical(
        dateRange.from,
        dateRange.to,
      );
      setHistorical(data);
    } catch {
      // Silently skip — historical data is secondary
    } finally {
      setHistLoading(false);
    }
  };

  // ─── CSV Export ─────────────────────────────────────────────────────────────
  const handleExport = async () => {
    try {
      setExporting(true);
      const { data } = await analyticsApi.exportCSV(
        dateRange.from,
        dateRange.to,
      );
      const url = URL.createObjectURL(data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `analytics-${dateRange.from}-to-${dateRange.to}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Analytics report downloaded');
    } catch {
      toast.error('Export failed — please try again');
    } finally {
      setExporting(false);
    }
  };

  // ─── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
        </div>
      </DashboardLayout>
    );
  }

  // ─── Metric cards config ────────────────────────────────────────────────────
  const metrics = [
    {
      title: 'Total Views',
      value: overview?.totalViews ?? 0,
      change: overview?.viewsGrowth ?? 0,
      icon: Eye,
      color: 'text-blue-500',
      bg: 'bg-blue-50 dark:bg-blue-950',
    },
    {
      title: 'Total Likes',
      value: overview?.totalLikes ?? 0,
      change: overview?.likesGrowth ?? 0,
      icon: Heart,
      color: 'text-pink-500',
      bg: 'bg-pink-50 dark:bg-pink-950',
    },
    {
      title: 'Total Shares',
      value: overview?.totalShares ?? 0,
      change: overview?.sharesGrowth ?? 0,
      icon: Share2,
      color: 'text-green-500',
      bg: 'bg-green-50 dark:bg-green-950',
    },
    {
      title: 'Total Comments',
      value: overview?.totalComments ?? 0,
      change: 0,
      icon: MessageCircle,
      color: 'text-orange-500',
      bg: 'bg-orange-50 dark:bg-orange-950',
    },
    {
      title: 'Engagement Rate',
      value: `${overview?.engagementRate ?? 0}%`,
      change: 0,
      icon: TrendingUp,
      color: 'text-purple-500',
      bg: 'bg-purple-50 dark:bg-purple-950',
    },
  ];

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      <div className="space-y-8">

        {/* ── Header ── */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold">Analytics Overview</h1>
            {lastRefreshed && (
              <p className="text-xs text-muted-foreground mt-1">
                Last refreshed: {lastRefreshed.toLocaleTimeString()}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchOverview}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={exporting}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              {exporting ? 'Exporting…' : 'Export CSV'}
            </Button>
          </div>
        </div>

        {/* ── Key Metric Cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {metrics.map((metric) => {
            const Icon = metric.icon;
            return (
              <Card key={metric.title} className="overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    {metric.title}
                  </CardTitle>
                  <span className={`p-2 rounded-full ${metric.bg}`}>
                    <Icon className={`h-4 w-4 ${metric.color}`} />
                  </span>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {typeof metric.value === 'number'
                      ? metric.value.toLocaleString()
                      : metric.value}
                  </div>
                  {metric.change !== 0 && (
                    <p
                      className={`text-xs mt-1 ${
                        metric.change > 0 ? 'text-green-500' : 'text-red-500'
                      }`}
                    >
                      {metric.change > 0 ? '+' : ''}
                      {metric.change}% vs last 30 days
                    </p>
                  )}
                  {metric.change === 0 && metric.title !== 'Engagement Rate' && metric.title !== 'Total Comments' && (
                    <p className="text-xs mt-1 text-muted-foreground">
                      No prior period data
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* ── Historical Chart ── */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                Performance Over Time
              </CardTitle>
              <div className="flex items-center gap-2 text-sm">
                <label className="text-muted-foreground">From</label>
                <input
                  type="date"
                  value={dateRange.from}
                  max={dateRange.to}
                  onChange={(e) =>
                    setDateRange((r) => ({ ...r, from: e.target.value }))
                  }
                  className="border rounded px-2 py-1 text-sm bg-background"
                />
                <label className="text-muted-foreground">To</label>
                <input
                  type="date"
                  value={dateRange.to}
                  min={dateRange.from}
                  max={toDateString(new Date())}
                  onChange={(e) =>
                    setDateRange((r) => ({ ...r, to: e.target.value }))
                  }
                  className="border rounded px-2 py-1 text-sm bg-background"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {histLoading ? (
              <div className="flex items-center justify-center h-40">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : historical.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
                <p className="text-sm">No historical data for selected range.</p>
                <p className="text-xs mt-1">
                  Analytics are recorded when content is published.
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart
                  data={historical}
                  margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) =>
                      new Date(v).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })
                    }
                  />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    labelFormatter={(v) =>
                      new Date(v).toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })
                    }
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="views"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={false}
                    name="Views"
                  />
                  <Line
                    type="monotone"
                    dataKey="likes"
                    stroke="#ec4899"
                    strokeWidth={2}
                    dot={false}
                    name="Likes"
                  />
                  <Line
                    type="monotone"
                    dataKey="shares"
                    stroke="#22c55e"
                    strokeWidth={2}
                    dot={false}
                    name="Shares"
                  />
                  <Line
                    type="monotone"
                    dataKey="comments"
                    stroke="#f97316"
                    strokeWidth={2}
                    dot={false}
                    name="Comments"
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* ── Platform Breakdown ── */}
        <Card>
          <CardHeader>
            <CardTitle>Performance by Platform</CardTitle>
          </CardHeader>
          <CardContent>
            {!overview?.platformBreakdown?.length ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No platform data yet. Publish content to see platform stats.
              </p>
            ) : (
              <div className="space-y-4">
                {overview.platformBreakdown.map((platform) => (
                  <div
                    key={platform.platform}
                    className="border rounded-lg p-4"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-base capitalize">
                        {platform.platform}
                      </h3>
                      <span
                        className={`text-sm font-medium px-2 py-0.5 rounded-full ${
                          platform.engagement >= 5
                            ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {platform.engagement}% engagement
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Views</p>
                        <p className="font-semibold text-base">
                          {platform.views.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Likes</p>
                        <p className="font-semibold text-base">
                          {platform.likes.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Shares</p>
                        <p className="font-semibold text-base">
                          {platform.shares.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Top Performing Content ── */}
        <Card>
          <CardHeader>
            <CardTitle>Top Performing Content</CardTitle>
          </CardHeader>
          <CardContent>
            {!overview?.topContent?.length ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No content performance data yet. Publish content to see
                rankings.
              </p>
            ) : (
              <div className="space-y-3">
                {overview.topContent.map((content, index) => (
                  <div
                    key={content.id}
                    className="flex items-center gap-4 p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                  >
                    <div className="text-2xl font-bold text-muted-foreground w-8 text-center">
                      #{index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold truncate">{content.title}</h4>
                      <p className="text-sm text-muted-foreground capitalize">
                        {content.platform || 'Unknown platform'}
                      </p>
                    </div>
                    <div className="flex gap-6 text-sm shrink-0">
                      <div className="text-center">
                        <p className="font-semibold">
                          {content.views.toLocaleString()}
                        </p>
                        <p className="text-muted-foreground">Views</p>
                      </div>
                      <div className="text-center">
                        <p className="font-semibold">
                          {content.likes.toLocaleString()}
                        </p>
                        <p className="text-muted-foreground">Likes</p>
                      </div>
                      <div className="text-center">
                        <p className="font-semibold text-green-600">
                          {content.engagement}%
                        </p>
                        <p className="text-muted-foreground">Engagement</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </DashboardLayout>
  );
}
