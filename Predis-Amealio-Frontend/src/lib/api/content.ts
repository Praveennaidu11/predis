import apiClient from '../api';

export interface ContentItem {
  id: string;
  userId: string;
  brandId?: string;
  type: string;
  prompt?: string;
  generatedText?: string;
  generatedImage?: string;
  generatedVideo?: string;
  status: 'draft' | 'published' | 'scheduled';
  platform?: string;
  scheduledAt?: string;
  publishedAt?: string;
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

export const contentApi = {
  // Generate content
  generateContent: (data: any) =>
    apiClient.post('/merchant/generate', data),

  // Save content
  saveContent: (data: any) =>
    apiClient.post('/merchant/save', data),

  // Get dashboard stats
  getDashboardStats: () => 
    apiClient.get<DashboardStats>('/merchant/dashboard'),

  // Get content list with optional filter
  getContent: (filter?: 'all' | 'draft' | 'published' | 'scheduled') =>
    apiClient.get<ContentItem[]>('/merchant/content/list', { 
      params: filter && filter !== 'all' ? { filter } : undefined 
    }),

  // Get content by ID
  getContentById: (id: string) =>
    apiClient.get<ContentItem>(`/merchant/content/${id}`),

  // Delete content
  deleteContent: (id: string) =>
    apiClient.delete(`/merchant/content/${id}`),

  // Schedule content
  scheduleContent: (id: string, scheduledAt: string) =>
    apiClient.post(`/merchant/content/${id}/schedule`, { scheduledAt }),

  // Get prompt suggestions
  promptSuggestions: (data: any) =>
    apiClient.post('/merchant/prompt-suggestions', data),
};
