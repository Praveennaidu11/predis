'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Share2, Image, Video, Facebook, Instagram, Linkedin } from 'lucide-react';
import { contentApi, ContentItem } from '@/lib/api/content';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface RecentContentSectionProps {
  onContentClick?: (content: ContentItem) => void;
  onShareClick?: (content: ContentItem) => void;
}

export default function RecentContentSection({ 
  onContentClick,
  onShareClick 
}: RecentContentSectionProps) {
  const [filter, setFilter] = useState<'all' | 'draft' | 'published' | 'scheduled'>('all');
  const [content, setContent] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewItem, setPreviewItem] = useState<ContentItem | null>(null);
  const [thumbErrorIds, setThumbErrorIds] = useState<Record<string, true>>({});
  const [previewVideoError, setPreviewVideoError] = useState<string | null>(null);

  useEffect(() => {
    fetchContent();
  }, [filter]);

  const fetchContent = async () => {
    try {
      setLoading(true);
      console.log(`Fetching content with filter: ${filter}...`);
      const response = await contentApi.getContent(filter);
      console.log('Content response:', response.data);
      setContent(response.data);
    } catch (error) {
      console.error('Failed to fetch content:', error);
      setContent([]);
    } finally {
      setLoading(false);
    }
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'Instagram': return <Instagram className="w-4 h-4" />;
      case 'Facebook': return <Facebook className="w-4 h-4" />;
      case 'LinkedIn': return <Linkedin className="w-4 h-4" />;
      default: return null;
    }
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      draft: 'bg-gray-100 text-gray-700',
      published: 'bg-green-100 text-green-700',
      scheduled: 'bg-blue-100 text-blue-700'
    };
    return styles[status as keyof typeof styles] || styles.draft;
  };

  const handleContentClick = (item: ContentItem) => {
    // Always open preview in Recent Content (videos should play on click).
    setPreviewItem(item);
    setPreviewOpen(true);

    // Optional hook for parent components (analytics/navigation etc).
    onContentClick?.(item);
  };

  const handleShareClick = async (e: React.MouseEvent, item: ContentItem) => {
    e.preventDefault();
    e.stopPropagation();
    if (onShareClick) {
      onShareClick(item);
      return;
    }
    const title = getContentTitle(item);
    const text = item.prompt || title;
    const url =
      normalizeMediaUrl(item.generatedVideo) ||
      normalizeMediaUrl(item.generatedImage) ||
      `${typeof window !== 'undefined' ? window.location.origin : ''}/merchant/content`;
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url });
        toast.success('Shared');
      } else {
        await navigator.clipboard.writeText(url);
        toast.success('Link copied to clipboard');
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      try {
        await navigator.clipboard.writeText(url);
        toast.success('Link copied to clipboard');
      } catch {
        toast.error('Could not share or copy link');
      }
    }
  };

  const handleStatusBadgeClick = (e: React.MouseEvent, item: ContentItem) => {
    e.preventDefault();
    e.stopPropagation();
    const s = (item.status || 'draft').toLowerCase();
    if (s === 'draft' || s === 'published' || s === 'scheduled') {
      setFilter(s);
      toast.success(`Showing ${s} content`);
    }
  };

  const getContentTitle = (item: ContentItem) => {
    if (item.prompt) {
      return item.prompt.length > 50 ? item.prompt.substring(0, 50) + '...' : item.prompt;
    }
    return `${item.type.charAt(0).toUpperCase() + item.type.slice(1)} Content`;
  };

  const getPreviewTitle = (item: ContentItem) => {
    const title = getContentTitle(item);
    return title.length > 80 ? title.substring(0, 80) + '...' : title;
  };

  const getBackendBaseUrl = () =>
    process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8001';

  const normalizeMediaUrl = (url?: string) => {
    if (!url) return undefined;
    if (url.startsWith('data:')) return url;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    const base = getBackendBaseUrl().replace(/\/$/, '');
    const path = url.startsWith('/') ? url : `/${url}`;
    return `${base}${path}`;
  };

  const downloadMedia = async (url: string, filename: string) => {
    try {
      const res = await fetch(url, { credentials: 'omit' });
      if (!res.ok) {
        throw new Error(`Failed to download (HTTP ${res.status})`);
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
      toast.success('Download started');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to download video');
      // Fallback: open in a new tab so user can download manually
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const getPlatforms = (item: ContentItem) => {
    if (item.platform) return [item.platform];
    return ['Instagram']; // Default fallback
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Content</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center justify-between p-5 border border-gray-200 rounded-xl">
                <div className="flex items-center gap-5 flex-1">
                  <div className="w-16 h-16 bg-gray-100 rounded-lg animate-pulse"></div>
                  <div className="flex-1">
                    <div className="h-4 bg-gray-200 rounded mb-2 w-3/4 animate-pulse"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/2 animate-pulse"></div>
                  </div>
                </div>
                <div className="w-20 h-6 bg-gray-200 rounded-full animate-pulse"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Content</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Filter Bar */}
        <div className="flex gap-2 mb-6">
          {(['all', 'draft', 'published', 'scheduled'] as const).map((filterType) => (
            <Button
              key={filterType}
              variant={filter === filterType ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(filterType)}
              className="capitalize"
            >
              {filterType}
            </Button>
          ))}
        </div>

        {/* Content List */}
        <div className="space-y-4">
          {content.map((item) => (
            <div
              key={item.id}
              onClick={() => handleContentClick(item)}
              className="group flex items-center justify-between p-5 border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer bg-white"
            >
              {/* Left Section - Thumbnail */}
              <div className="flex items-center gap-5 flex-1">
                <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {item.generatedImage ? (
                    <img
                      src={item.generatedImage}
                      alt={getContentTitle(item)}
                      className="w-full h-full object-cover"
                    />
                  ) : item.generatedVideo && !thumbErrorIds[item.id] ? (
                    <video
                      src={normalizeMediaUrl(item.generatedVideo)}
                      className="w-full h-full object-cover"
                      muted
                      playsInline
                      preload="metadata"
                      onError={() => {
                        setThumbErrorIds((prev) => ({ ...prev, [item.id]: true }));
                      }}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center">
                      {item.generatedVideo || item.type === 'video' ? (
                        <Video className="w-6 h-6 text-gray-400" />
                      ) : (
                        <Image className="w-6 h-6 text-gray-400" />
                      )}
                      <span className="text-xs text-gray-500 mt-1">
                        {(item.generatedVideo || item.type === 'video' ? 'VIDEO' : item.type || 'CONTENT').toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>

                {/* Middle Section - Content Details */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 mb-2 truncate">
                    {getContentTitle(item)}
                  </h3>
                  
                  {/* Platforms */}
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-xs text-gray-500">Platforms:</span>
                    <div className="flex gap-2">
                      {getPlatforms(item).map((platform) => (
                        <div 
                          key={platform}
                          className="flex items-center gap-1 px-2 py-1 bg-gray-50 rounded text-xs text-gray-600"
                        >
                          {getPlatformIcon(platform)}
                          <span>{platform}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Date */}
                  <div className="text-xs text-gray-400">
                    Date: {new Date(item.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>

              {/* Right Section - Actions & Status — stopPropagation so row click does not open video */}
              <div
                className="flex items-center gap-3 flex-shrink-0"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                {/* Share Icon */}
                <button
                  type="button"
                  aria-label="Share content"
                  title="Share"
                  onClick={(e) => handleShareClick(e, item)}
                  className="p-2 rounded-lg text-gray-500 transition-all duration-200 hover:bg-indigo-50 hover:text-indigo-600 hover:ring-2 hover:ring-indigo-200/80 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                >
                  <Share2 className="w-4 h-4" />
                </button>

                {/* Status Badge — filters list to this status */}
                <button
                  type="button"
                  title={`Filter by ${item.status}`}
                  onClick={(e) => handleStatusBadgeClick(e, item)}
                  className={`px-3 py-1 text-xs font-medium rounded-full cursor-pointer transition-all duration-200 hover:brightness-95 hover:ring-2 hover:ring-gray-300/90 hover:shadow-sm hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${getStatusBadge(item.status)}`}
                >
                  {item.status}
                </button>
              </div>
            </div>
          ))}
        </div>

        {content.length === 0 && !loading && (
          <div className="text-center py-8 text-gray-500">
            No content found for the selected filter.
          </div>
        )}
      </CardContent>

      <Dialog
        open={previewOpen}
        onOpenChange={(open) => {
          setPreviewOpen(open);
          if (!open) {
            setPreviewItem(null);
            setPreviewVideoError(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{previewItem ? getPreviewTitle(previewItem) : 'Preview'}</DialogTitle>
            <DialogDescription>
              {previewItem?.platform ? `Platform: ${previewItem.platform}` : 'Content preview'}
            </DialogDescription>
          </DialogHeader>

          {previewItem && (
            <div className="space-y-4">
              {previewItem.generatedImage ? (
                <div className="rounded-md overflow-hidden border">
                  <img
                    src={previewItem.generatedImage}
                    alt={getContentTitle(previewItem)}
                    className="w-full object-cover max-h-[60vh]"
                  />
                </div>
              ) : previewItem.generatedVideo ? (
                <div className="space-y-3">
                  <div className="rounded-md overflow-hidden border bg-black">
                    <video
                      src={normalizeMediaUrl(previewItem.generatedVideo)}
                      controls
                      autoPlay
                      muted
                      playsInline
                      className="w-full max-h-[60vh]"
                      onError={() => {
                        setPreviewVideoError(
                          normalizeMediaUrl(previewItem.generatedVideo) ||
                            'Video failed to load (invalid URL).',
                        );
                      }}
                    />
                  </div>

                  {normalizeMediaUrl(previewItem.generatedVideo) && (
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          const url = normalizeMediaUrl(previewItem.generatedVideo)!;
                          window.open(url, '_blank', 'noopener,noreferrer');
                        }}
                      >
                        Open
                      </Button>
                      <Button
                        onClick={() => {
                          const url = normalizeMediaUrl(previewItem.generatedVideo)!;
                          const safeId = previewItem.id || 'video';
                          downloadMedia(url, `amealio_${safeId}.mp4`);
                        }}
                      >
                        Download
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-md border p-4 text-sm text-gray-700">
                  No preview media available.
                </div>
              )}

              {previewVideoError && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <div className="font-medium mb-1">Video failed to load</div>
                  <div className="break-all">
                    URL: {previewVideoError}
                  </div>
                  <div className="mt-2">
                    <a
                      href={previewVideoError}
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                    >
                      Open video in new tab
                    </a>
                  </div>
                </div>
              )}

              {previewItem.generatedText && (
                <div className="rounded-md border p-4 text-sm text-gray-700 whitespace-pre-wrap">
                  {previewItem.generatedText}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
