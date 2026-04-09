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

export interface AnalyticsOverview {
  totalViews: number;
  totalLikes: number;
  totalShares: number;
  totalComments: number;
  engagementRate: number;
  viewsGrowth?: number;
  likesGrowth?: number;
  sharesGrowth?: number;
  platformBreakdown?: Array<{
    platform: string;
    views: number;
    likes: number;
    shares: number;
    comments?: number;
  }>;
  topContent?: Array<{
    id: string;
    prompt?: string;
    platform?: string;
    views?: number;
    likes?: number;
    shares?: number;
    comments?: number;
  }>;
}

export interface HistoricalDataPoint {
  date: string;
  views: number;
  likes: number;
  shares: number;
  comments?: number;
}

export const analyticsApi = {
  getOverview: () => apiClient.get<AnalyticsOverview>('/analytics/overview'),
  getHistorical: (from: string, to: string) =>
    apiClient.get<HistoricalDataPoint[]>('/analytics/historical', { params: { from, to } }),
  exportCSV: (from: string, to: string) =>
    apiClient.get('/analytics/export', { params: { from, to }, responseType: 'blob' as any }),
};

export const contentApi = {
  generateContent: (data: any) => apiClient.post('/merchant/generate', data),
  saveContent: (data: any) => apiClient.post('/merchant/save', data),

  getDashboardStats: () => apiClient.get<DashboardStats>('/merchant/dashboard'),

  /**
   * Backwards compatible:
   * - getContent('all')
   * - getContent({ filter: 'scheduled', limit: 100 })
   * - getContent('all', { trash: true })
   */
  getContent: (
    filterOrParams?: GetContentParams['filter'] | GetContentParams,
    extra?: { trash?: boolean; limit?: number },
  ) => {
    const params: any = {};
    if (typeof filterOrParams === 'string') {
      if (filterOrParams && filterOrParams !== 'all') params.filter = filterOrParams;
    } else if (filterOrParams) {
      if (filterOrParams.filter && filterOrParams.filter !== 'all') params.filter = filterOrParams.filter;
      if (filterOrParams.q) params.q = filterOrParams.q;
      if (filterOrParams.tag) params.tag = filterOrParams.tag;
      if (filterOrParams.page) params.page = filterOrParams.page;
      if (filterOrParams.limit) params.limit = filterOrParams.limit;
    }
    if (extra?.trash) params.trash = '1';
    if (extra?.limit) params.limit = extra.limit;

    return apiClient.get<ContentItem[]>('/merchant/content/list', { params: Object.keys(params).length ? params : undefined });
  },

  getContentById: (id: string) => apiClient.get<ContentItem>(`/merchant/content/${id}`),

  deleteContent: (id: string) => apiClient.delete(`/merchant/content/${id}`),
  restoreContent: (id: string) => apiClient.post(`/merchant/content/${id}/restore`),

  scheduleContent: (id: string, scheduledAt: string) =>
    apiClient.post(`/merchant/content/${id}/schedule`, { scheduledAt }),
  cancelSchedule: (id: string) => apiClient.delete(`/merchant/content/${id}/schedule`),

  promptSuggestions: (data: any) => apiClient.post('/merchant/prompt-suggestions', data),

  // Social endpoints used by dashboard
  getSocialAccounts: () => apiClient.get('/social/accounts'),
  publishContent: (data: any) => apiClient.post('/social/publish', data),

  // Optional image endpoints (if enabled server-side)
  generateImage: (data: GenerateImageRequest) =>
    apiClient.post<GenerateImageResponse>('/merchant/images/generate', data),
  editImage: (data: EditImageRequest) =>
    apiClient.post<GenerateImageResponse>('/merchant/images/edit', data),
};
