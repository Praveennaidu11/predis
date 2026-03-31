'use client';

import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import apiClient from '@/lib/api';
import { toast } from 'sonner';
import { Search, RefreshCw } from 'lucide-react';
import GenerationPanel from '@/components/generation/GenerationPanel';

type AdminContentItem = {
  id: string;
  userId: string;
  type: string;
  prompt?: string;
  generatedText?: string;
  generatedImage?: string;
  generatedVideo?: string;
  status: string;
  platform?: string;
  createdAt: string;
  user?: { id: string; email: string; fullName?: string; role?: string };
  brand?: { id: string; name: string; logo?: string };
};

export default function AdminContentPage() {
  const [items, setItems] = useState<AdminContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<'all' | 'draft' | 'published' | 'scheduled'>('all');
  const [query, setQuery] = useState('');

  const fetchContent = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/admin/content', {
        params: { status, limit: 200 },
      });
      setItems(Array.isArray(res.data) ? res.data : []);
    } catch (e: any) {
      toast.error('Failed to load content', {
        description: e?.response?.data?.message || e?.message,
      });
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => {
      const hay = [
        i.prompt,
        i.type,
        i.status,
        i.platform,
        i.user?.email,
        i.user?.fullName,
        i.brand?.name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [items, query]);

  return (
    <DashboardLayout>
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">Content</h1>
          <Button variant="outline" onClick={fetchContent} disabled={loading}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        <div className="mb-6">
          <GenerationPanel title="AI Generation (Admin)" mode="admin" defaultPlatform="instagram" />
        </div>

        <Card className="mb-6">
          <CardContent className="py-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by prompt, user, brand, platform..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={status} onValueChange={(v) => setStatus(v as any)}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All status</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              Content Items ({loading ? '…' : filtered.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-12">
                No content found.
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map((i) => (
                  <div
                    key={i.id}
                    className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        {i.prompt || `${i.type} content`}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        <span className="capitalize">{i.status}</span>
                        {i.platform ? ` • ${i.platform}` : ''}
                        {i.user?.email ? ` • ${i.user.email}` : ''}
                        {i.brand?.name ? ` • ${i.brand.name}` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="capitalize">{i.type}</span>
                      <span>•</span>
                      <span>{new Date(i.createdAt).toLocaleString()}</span>
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

