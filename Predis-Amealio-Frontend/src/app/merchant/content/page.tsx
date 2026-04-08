'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Download,
  Edit3,
  Eye,
  ImageIcon,
  Loader2,
  Plus,
  Search,
  Tag,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import { contentApi, ContentItem, ContentStatus, GetContentParams } from '@/lib/api/content';

// ─── Constants ────────────────────────────────────────────────────────────────

const ITEMS_PER_PAGE = 20;

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'published', label: 'Published' },
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusBadgeVariant(
  status: ContentStatus,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'published':
      return 'default';
    case 'scheduled':
      return 'secondary';
    case 'publishing':
      return 'secondary';
    case 'failed':
      return 'destructive';
    default:
      return 'outline';
  }
}

function statusLabel(status: ContentStatus): string {
  switch (status) {
    case 'publishing':
      return 'Publishing…';
    case 'failed':
      return 'Failed';
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

function parseTags(raw: string): string[] {
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ContentLibraryPage() {
  const router = useRouter();

  // ── Data state
  const [items, setItems] = useState<ContentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // ── Filter state
  const [activeFilter, setActiveFilter] = useState<GetContentParams['filter']>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);

  // ── Modal state
  const [viewItem, setViewItem] = useState<ContentItem | null>(null);
  const [scheduleItem, setScheduleItem] = useState<ContentItem | null>(null);
  const [deleteItem, setDeleteItem] = useState<ContentItem | null>(null);
  const [editItem, setEditItem] = useState<ContentItem | null>(null);

  // ── Edit-text modal
  const [editText, setEditText] = useState('');
  const [editTagsInput, setEditTagsInput] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // ── Schedule modal
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [scheduleSaving, setScheduleSaving] = useState(false);

  // ── Delete modal
  const [deleteConfirming, setDeleteConfirming] = useState(false);

  // ── Copy feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // ── Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 320);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // ─── Fetch ──────────────────────────────────────────────────────────────────

  const fetchContent = useCallback(
    async (targetPage: number, q: string, filter: GetContentParams['filter'], tag: string | null) => {
      setLoading(true);
      try {
        const res = await contentApi.getContent({
          page: targetPage,
          limit: ITEMS_PER_PAGE,
          filter: filter ?? 'all',
          q: q || undefined,
          tag: tag || undefined,
        });
        setItems(res.data.data);
        setTotal(res.data.total);
        setTotalPages(res.data.totalPages);
      } catch {
        setItems([]);
        setTotal(0);
        setTotalPages(1);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Reset to page 1 when filters/search change
  useEffect(() => {
    setPage(1);
    fetchContent(1, debouncedSearch, activeFilter, activeTag);
  }, [debouncedSearch, activeFilter, activeTag, fetchContent]);

  // Fetch when page changes (not caused by filter change)
  const prevFiltersRef = useRef({ debouncedSearch, activeFilter, activeTag });
  useEffect(() => {
    const prev = prevFiltersRef.current;
    const filtersChanged =
      prev.debouncedSearch !== debouncedSearch ||
      prev.activeFilter !== activeFilter ||
      prev.activeTag !== activeTag;
    prevFiltersRef.current = { debouncedSearch, activeFilter, activeTag };
    if (!filtersChanged) {
      fetchContent(page, debouncedSearch, activeFilter, activeTag);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // ─── Derived ────────────────────────────────────────────────────────────────

  const availableTags = useMemo(() => {
    const set = new Set<string>();
    items.forEach((item) =>
      item.tags?.forEach((t) => {
        const trimmed = t.trim();
        if (trimmed) set.add(trimmed);
      }),
    );
    return Array.from(set).sort();
  }, [items]);

  // ─── Handlers ───────────────────────────────────────────────────────────────

  function handleEdit(item: ContentItem) {
    if (item.type === 'text') {
      setEditItem(item);
      setEditText(item.generatedText ?? '');
      setEditTagsInput(item.tags?.join(', ') ?? '');
    } else {
      router.push(`/merchant/create?id=${item.id}`);
    }
  }

  async function handleSaveEdit() {
    if (!editItem) return;
    setEditSaving(true);
    try {
      const updated = await contentApi.updateContent(editItem.id, {
        generatedText: editText,
        tags: parseTags(editTagsInput),
      });
      setItems((prev) =>
        prev.map((i) => (i.id === editItem.id ? updated.data : i)),
      );
      setEditItem(null);
    } catch {
      alert('Failed to save changes. Please try again.');
    } finally {
      setEditSaving(false);
    }
  }

  async function handleSchedule() {
    if (!scheduleItem || !scheduleDate) return;
    setScheduleSaving(true);
    try {
      const iso = new Date(`${scheduleDate}T${scheduleTime || '00:00'}:00`).toISOString();
      const updated = await contentApi.scheduleContent(scheduleItem.id, iso);
      setItems((prev) =>
        prev.map((i) => (i.id === scheduleItem.id ? updated.data : i)),
      );
      setScheduleItem(null);
    } catch {
      alert('Failed to schedule. Please try again.');
    } finally {
      setScheduleSaving(false);
    }
  }

  async function handleCancelSchedule(item: ContentItem) {
    try {
      const updated = await contentApi.cancelSchedule(item.id);
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? updated.data : i)),
      );
    } catch {
      alert('Failed to cancel schedule.');
    }
  }

  async function handleDelete() {
    if (!deleteItem) return;
    setDeleteConfirming(true);
    try {
      await contentApi.deleteContent(deleteItem.id);
      setItems((prev) => prev.filter((i) => i.id !== deleteItem.id));
      setTotal((t) => t - 1);
      setDeleteItem(null);
    } catch {
      alert('Failed to delete content.');
    } finally {
      setDeleteConfirming(false);
    }
  }

  async function handleCopyText(text: string, itemId: string) {
    await navigator.clipboard.writeText(text);
    setCopiedId(itemId);
    setTimeout(() => setCopiedId(null), 1800);
  }

  async function handleDownloadImage(url: string, fileName = 'image.jpg') {
    try {
      const res = await contentApi.downloadImage(url);
      const blob = new Blob([res.data as BlobPart]);
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(url, '_blank');
    }
  }

  // ─── Render helpers ─────────────────────────────────────────────────────────

  function ContentTypeIcon({ type }: { type: string }) {
    if (type === 'image') return <ImageIcon className="w-4 h-4" />;
    if (type === 'video') return <Video className="w-4 h-4" />;
    return <Edit3 className="w-4 h-4" />;
  }

  // ─── Main render ────────────────────────────────────────────────────────────

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Content Library</h1>
            {!loading && (
              <p className="text-sm text-muted-foreground mt-1">
                {total} item{total !== 1 ? 's' : ''}
                {debouncedSearch ? ` matching "${debouncedSearch}"` : ''}
              </p>
            )}
          </div>
          <Button onClick={() => router.push('/merchant/create')}>
            <Plus className="w-4 h-4 mr-2" />
            Create New
          </Button>
        </div>

        {/* Search + filters */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search by prompt or text…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Status filter tabs */}
            <div className="flex items-center gap-1 rounded-lg border bg-muted/40 p-1">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setActiveFilter(f.value as GetContentParams['filter'])}
                  className={`px-3 py-1 text-sm rounded-md transition-colors ${
                    activeFilter === f.value
                      ? 'bg-white shadow text-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tag filter chips */}
          {availableTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Tag className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <button
                onClick={() => setActiveTag(null)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  activeTag === null
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border text-muted-foreground hover:border-primary/60'
                }`}
              >
                All tags
              </button>
              {availableTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    activeTag === tag
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border text-muted-foreground hover:border-primary/60'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Grid */}
        {loading ? (
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            Loading content…
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground text-sm gap-2">
            <p className="font-medium">No content found</p>
            {(debouncedSearch || activeTag || activeFilter !== 'all') && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setActiveTag(null);
                  setActiveFilter('all');
                }}
                className="text-primary underline text-xs"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {items.map((item) => (
              <Card key={item.id} className="overflow-hidden flex flex-col">
                {/* Preview thumbnail */}
                <div className="relative bg-muted aspect-video flex items-center justify-center overflow-hidden">
                  {item.generatedImage ? (
                    <img
                      src={item.generatedImage}
                      alt="Content preview"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : item.generatedVideo ? (
                    <div className="flex flex-col items-center gap-1 text-muted-foreground">
                      <Video className="w-8 h-8" />
                      <span className="text-xs">Video</span>
                    </div>
                  ) : (
                    <div className="p-3 w-full h-full flex items-start overflow-hidden">
                      <p className="text-xs text-muted-foreground line-clamp-5 text-left">
                        {item.generatedText || item.prompt || 'No preview'}
                      </p>
                    </div>
                  )}
                  {/* Type badge */}
                  <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/60 text-white px-2 py-0.5 text-[10px] font-medium">
                    <ContentTypeIcon type={item.type} />
                    {item.type.toUpperCase()}
                  </span>
                </div>

                <CardContent className="flex-1 flex flex-col p-3 gap-2">
                  {/* Status + date */}
                  <div className="flex items-center justify-between gap-1">
                    <Badge variant={statusBadgeVariant(item.status)} className="text-[10px] h-5">
                      {statusLabel(item.status)}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      {formatDate(item.scheduledAt ?? item.createdAt)}
                    </span>
                  </div>

                  {/* Platform */}
                  {item.platform && (
                    <p className="text-xs text-muted-foreground capitalize">{item.platform}</p>
                  )}

                  {/* Tags */}
                  {item.tags && item.tags.filter(Boolean).length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {item.tags.filter(Boolean).slice(0, 4).map((tag) => (
                        <button
                          key={tag}
                          onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground hover:bg-secondary/70 transition-colors"
                        >
                          #{tag}
                        </button>
                      ))}
                      {item.tags.filter(Boolean).length > 4 && (
                        <span className="text-[10px] text-muted-foreground self-center">
                          +{item.tags.filter(Boolean).length - 4}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex flex-wrap gap-1.5 mt-auto pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      onClick={() => setViewItem(item)}
                    >
                      <Eye className="w-3 h-3 mr-1" />
                      View
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      onClick={() => handleEdit(item)}
                    >
                      <Edit3 className="w-3 h-3 mr-1" />
                      Edit
                    </Button>
                    {item.status === 'draft' || item.status === 'failed' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        onClick={() => {
                          setScheduleItem(item);
                          setScheduleDate('');
                          setScheduleTime('');
                        }}
                      >
                        <Clock className="w-3 h-3 mr-1" />
                        Schedule
                      </Button>
                    ) : item.status === 'scheduled' ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-orange-600"
                        onClick={() => handleCancelSchedule(item)}
                      >
                        <X className="w-3 h-3 mr-1" />
                        Unschedule
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                      onClick={() => setDeleteItem(item)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 py-4">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="w-4 h-4" />
              Prev
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
              <span className="ml-2 text-xs">({total} total)</span>
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>

      {/* ── View Modal ─────────────────────────────────────────────────────── */}
      <Dialog open={!!viewItem} onOpenChange={() => setViewItem(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ContentTypeIcon type={viewItem?.type ?? 'text'} />
              Content Preview
              <Badge
                variant={statusBadgeVariant(viewItem?.status ?? 'draft')}
                className="ml-auto text-xs"
              >
                {statusLabel(viewItem?.status ?? 'draft')}
              </Badge>
            </DialogTitle>
          </DialogHeader>

          {viewItem && (
            <div className="space-y-4">
              {/* Image preview */}
              {viewItem.generatedImage && (
                <div className="rounded-lg overflow-hidden border">
                  <img
                    src={viewItem.generatedImage}
                    alt="Generated"
                    className="w-full object-contain max-h-80"
                  />
                </div>
              )}

              {/* Video preview */}
              {viewItem.generatedVideo && (
                <div className="rounded-lg overflow-hidden border bg-black">
                  <video
                    src={viewItem.generatedVideo}
                    controls
                    className="w-full max-h-72"
                    preload="metadata"
                  >
                    Your browser does not support video playback.
                  </video>
                </div>
              )}

              {/* Generated text */}
              {viewItem.generatedText && (
                <div className="relative rounded-lg border bg-muted/40 p-4">
                  <p className="text-sm whitespace-pre-wrap leading-relaxed pr-8">
                    {viewItem.generatedText}
                  </p>
                  <button
                    onClick={() => handleCopyText(viewItem.generatedText!, viewItem.id)}
                    className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
                    title="Copy text"
                  >
                    {copiedId === viewItem.id ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              )}

              {/* Prompt */}
              {viewItem.prompt && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Prompt</p>
                  <p className="text-sm text-muted-foreground italic">{viewItem.prompt}</p>
                </div>
              )}

              {/* Meta */}
              <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                {viewItem.platform && (
                  <div>
                    <span className="font-medium text-foreground">Platform: </span>
                    {viewItem.platform}
                  </div>
                )}
                {viewItem.scheduledAt && (
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {new Date(viewItem.scheduledAt).toLocaleString()}
                  </div>
                )}
                {viewItem.brand && (
                  <div>
                    <span className="font-medium text-foreground">Brand: </span>
                    {viewItem.brand.name}
                  </div>
                )}
                <div>
                  <span className="font-medium text-foreground">Created: </span>
                  {formatDate(viewItem.createdAt)}
                </div>
              </div>

              {/* Tags */}
              {viewItem.tags && viewItem.tags.filter(Boolean).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {viewItem.tags.filter(Boolean).map((tag) => (
                    <span
                      key={tag}
                      className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 flex-wrap">
            {viewItem?.generatedImage && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDownloadImage(viewItem.generatedImage!)}
              >
                <Download className="w-4 h-4 mr-2" />
                Download Image
              </Button>
            )}
            {viewItem?.generatedText && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopyText(viewItem.generatedText!, viewItem.id)}
              >
                {copiedId === viewItem.id ? (
                  <Check className="w-4 h-4 mr-2 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4 mr-2" />
                )}
                Copy Text
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setViewItem(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Text Modal ────────────────────────────────────────────────── */}
      <Dialog open={!!editItem} onOpenChange={() => setEditItem(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Content</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Generated Text</label>
              <Textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                rows={8}
                className="resize-y text-sm"
                placeholder="Edit your content here…"
              />
              <p className="text-xs text-muted-foreground text-right">
                {editText.length} chars
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5" />
                Tags
              </label>
              <Input
                value={editTagsInput}
                onChange={(e) => setEditTagsInput(e.target.value)}
                placeholder="promo, festival, food (comma-separated)"
                className="text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Separate tags with commas
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditItem(null)} disabled={editSaving}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={editSaving || !editText.trim()}>
              {editSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving…
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Schedule Modal ─────────────────────────────────────────────────── */}
      <Dialog open={!!scheduleItem} onOpenChange={() => setScheduleItem(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Schedule Post</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Date</label>
              <Input
                type="date"
                value={scheduleDate}
                min={new Date().toISOString().split('T')[0]}
                onChange={(e) => setScheduleDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Time (optional)</label>
              <Input
                type="time"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleItem(null)} disabled={scheduleSaving}>
              Cancel
            </Button>
            <Button onClick={handleSchedule} disabled={scheduleSaving || !scheduleDate}>
              {scheduleSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Scheduling…
                </>
              ) : (
                <>
                  <Clock className="w-4 h-4 mr-2" />
                  Schedule
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm Modal ───────────────────────────────────────────── */}
      <Dialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Content</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete this {deleteItem?.type} content? This action cannot be
            undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteItem(null)} disabled={deleteConfirming}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteConfirming}>
              {deleteConfirming ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting…
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
