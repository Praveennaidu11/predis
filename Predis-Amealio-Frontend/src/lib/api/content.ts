import apiClient from "../api";

export type ContentStatus =
  | "draft"
  | "published"
  | "scheduled"
  | "publishing"
  | "failed";

export interface ContentItem {
  id: string;
  userId: string;
  brandId?: string;
  sourceContentId?: string;
  version?: number;
  type: string;
  prompt?: string;
  generatedText?: string;
  generatedImage?: string;
  generatedVideo?: string;
  status: ContentStatus;
  platform?: string;
  scheduledAt?: string;
  publishedAt?: string;
  tags?: string[];
  metadata?: any;
  createdAt: string;
  updatedAt: string;
  brand?: {
    id: string;
    name: string;
    logo?: string;
  };
  analytics?: Array<{
    views: number;
    likes: number;
    shares: number;
  }>;
}

export interface PaginatedContentResponse {
  data: ContentItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface GetContentParams {
  filter?: "all" | "draft" | "published" | "scheduled";
  q?: string;
  tag?: string;
  page?: number;
  limit?: number;
}

export interface DashboardStats {
  totalContent: number;
  draftedContent: number;
  scheduledContent: number;
  publishedContent: number;
  totalViews: number;
  totalLikes: number;
  totalShares: number;
  recentContent: ContentItem[];
}

export interface GenerateImageRequest {
  prompt: string;
  model?: string;
  style?: string;
  variations?: number;
  aspectRatio?: string;
}

export interface EditImageRequest extends GenerateImageRequest {
  previousPrompt?: string;
  previousImage?: string;
  sourceContentId?: string;
  persistVersion?: boolean;
}

export interface GenerateImageResponse {
  success: boolean;
  images: string[];
  meta: {
    prompt: string;
    style: string | null;
    variations: number;
    aspectRatio?: string | null;
    model?: string | null;
    previousPrompt?: string | null;
    sourceImage?: string | null;
    duplicateDetected?: boolean;
    retriesUsed?: number;
    sourceContentId?: string | null;
    version?: number | null;
    versionContentId?: string | null;
  };
}

export interface UpdateContentRequest {
  prompt?: string;
  generatedText?: string;
  generatedImage?: string;
  generatedVideo?: string;
  platform?: string;
  status?: string;
  brandId?: string;
  tags?: string[];
  metadata?: Record<string, any>;
  sourceContentId?: string;
  version?: number;
  createVersion?: boolean;
}

// ─── Analytics Types ──────────────────────────────────────────────────────────

export interface AnalyticsOverview {
  totalViews: number;
  totalLikes: number;
  totalShares: number;
  totalComments: number;
  engagementRate: number;
  viewsGrowth: number;
  likesGrowth: number;
  sharesGrowth: number;
  platformBreakdown: PlatformStat[];
  topContent: TopContent[];
}

export interface PlatformStat {
  platform: string;
  views: number;
  likes: number;
  shares: number;
  engagement: number;
}

export interface TopContent {
  id: string;
  title: string;
  platform: string;
  views: number;
  likes: number;
  shares: number;
  engagement: number;
}

export interface HistoricalDataPoint {
  date: string;
  views: string;
  likes: string;
  shares: string;
  comments: string;
}

export interface ContentAnalytics {
  contentId: string;
  platform: string;
  analytics: Array<{
    date: string;
    views: number;
    likes: number;
    shares: number;
    comments: number;
    engagementRate: number;
  }>;
}

export interface RecordAnalyticsRequest {
  contentId: string;
  views?: number;
  likes?: number;
  shares?: number;
  comments?: number;
}

// ─── Analytics API ────────────────────────────────────────────────────────────

export const analyticsApi = {
  getOverview: () => apiClient.get<AnalyticsOverview>("/analytics/overview"),

  getPlatformBreakdown: () =>
    apiClient.get<PlatformStat[]>("/analytics/platform"),

  getTopContent: () => apiClient.get<TopContent[]>("/analytics/top-content"),

  getHistorical: (from: string, to: string, platform?: string) =>
    apiClient.get<HistoricalDataPoint[]>("/analytics/historical", {
      params: { from, to, ...(platform ? { platform } : {}) },
    }),

  getContentAnalytics: (contentId: string) =>
    apiClient.get<ContentAnalytics>(`/analytics/content/${contentId}`),

  recordAnalytics: (data: RecordAnalyticsRequest) =>
    apiClient.post("/analytics/record", data),

  exportCSV: (from: string, to: string) =>
    apiClient.get("/analytics/export", {
      params: { from, to },
      responseType: "blob",
    }),
};

// ─── Content API ─────────────────────────────────────────────────────────────

export const contentApi = {
  generateContent: (data: any) => apiClient.post("/merchant/generate", data),

  getSocialAccounts: () => apiClient.get("/social/accounts"),

  publishContent: (data: {
    contentId: string;
    accountId: string;
    scheduledAt?: string;
  }) => apiClient.post("/social/publish", data),

  saveContent: (data: any) => apiClient.post("/merchant/save", data),

  updateContent: (id: string, data: UpdateContentRequest) =>
    apiClient.patch<ContentItem>(`/merchant/content/${id}`, data),

  generateImage: (data: GenerateImageRequest) =>
    apiClient.post<GenerateImageResponse>("/merchant/image/generate", data),

  editImage: (data: EditImageRequest) =>
    apiClient.post<GenerateImageResponse>("/merchant/image/edit", data),

  downloadImage: (url: string) =>
    apiClient.get<Blob>("/merchant/image/download", {
      params: { url },
      responseType: "blob",
    }),

  getDashboardStats: () => apiClient.get<DashboardStats>("/merchant/dashboard"),

  // Paginated content list — replaces old /merchant/content/list (no params)
  getContent: (params?: GetContentParams) =>
    apiClient.get<PaginatedContentResponse>("/merchant/content", {
      params: params ?? {},
    }),

  getContentById: (id: string) =>
    apiClient.get<ContentItem>(`/merchant/content/${id}`),

  deleteContent: (id: string) => apiClient.delete(`/merchant/content/${id}`),

  scheduleContent: (id: string, scheduledAt: string) =>
    apiClient.post(`/merchant/content/${id}/schedule`, { scheduledAt }),

  cancelSchedule: (id: string) =>
    apiClient.delete(`/merchant/content/${id}/schedule`),
};
