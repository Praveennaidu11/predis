import apiClient from '@/lib/api';

export interface Content {
  id: string;
  userId: string;
  brandId?: string;
  type: string;
  prompt?: string;
  generatedText?: string;
  generatedImage?: string;
  generatedVideo?: string;
  status: 'draft' | 'scheduled' | 'published' | 'publishing' | 'failed';
  platform?: string;
  scheduledAt?: string;
  publishedAt?: string;
  tags?: string[];
  metadata?: any;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardStats {
  totalContent: number;
  draftedContent: number;
  scheduledContent: number;
  publishedContent: number;
  totalViews: number;
  totalLikes: number;
  totalShares: number;
  recentContent: Content[];
}

class ContentService {
  // Get paginated content list
  async getContent(filter?: string, page = 1, limit = 20): Promise<Content[]> {
    try {
      const params: Record<string, unknown> = { page, limit };
      if (filter && filter !== 'all') params.filter = filter;
      const response = await apiClient.get('/merchant/content', { params });
      // API now returns { data, total, page, limit, totalPages }
      return response.data.data ?? [];
    } catch (error) {
      console.error('Error fetching content:', error);
      throw error;
    }
  }

  // Get content by ID
  async getContentById(id: string): Promise<Content> {
    try {
      const response = await apiClient.get(`/merchant/content/${id}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching content by ID:', error);
      throw error;
    }
  }

  // Delete content
  async deleteContent(id: string): Promise<void> {
    try {
      await apiClient.delete(`/merchant/content/${id}`);
    } catch (error) {
      console.error('Error deleting content:', error);
      throw error;
    }
  }

  // Schedule content
  async scheduleContent(id: string, scheduledAt: Date): Promise<Content> {
    try {
      const response = await apiClient.post(`/merchant/content/${id}/schedule`, {
        scheduledAt: scheduledAt.toISOString(),
      });
      return response.data;
    } catch (error) {
      console.error('Error scheduling content:', error);
      throw error;
    }
  }

  // Get dashboard stats
  async getDashboardStats(): Promise<DashboardStats> {
    try {
      const response = await apiClient.get('/merchant/dashboard');
      return response.data;
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      throw error;
    }
  }

  // Generate content
  async generateContent(dto: any): Promise<any> {
    try {
      const response = await apiClient.post('/merchant/generate', dto);
      return response.data;
    } catch (error) {
      console.error('Error generating content:', error);
      throw error;
    }
  }

  // Save content
  async saveContent(dto: any): Promise<Content> {
    try {
      const response = await apiClient.post('/merchant/save', dto);
      return response.data;
    } catch (error) {
      console.error('Error saving content:', error);
      throw error;
    }
  }

  // Helper method to get platform display name
  getPlatformDisplayName(platform?: string): string {
    switch (platform?.toLowerCase()) {
      case 'instagram':
        return 'Instagram';
      case 'facebook':
        return 'Facebook';
      case 'linkedin':
        return 'LinkedIn';
      case 'twitter':
      case 'x':
        return 'X / Twitter';
      default:
        return platform || 'Unknown';
    }
  }

  // Helper method to get status display name
  getStatusDisplayName(status: string): string {
    switch (status?.toLowerCase()) {
      case 'draft':      return 'Drafted';
      case 'scheduled':  return 'Scheduled';
      case 'published':  return 'Published';
      case 'publishing': return 'Publishing…';
      case 'failed':     return 'Failed';
      default:           return status || 'Unknown';
    }
  }

  // Helper method to get status color
  getStatusColor(status: string): string {
    switch (status?.toLowerCase()) {
      case 'draft':      return 'text-gray-500';
      case 'scheduled':  return 'text-blue-500';
      case 'published':  return 'text-green-500';
      case 'publishing': return 'text-yellow-500';
      case 'failed':     return 'text-red-500';
      default:           return 'text-gray-500';
    }
  }
}

export const contentService = new ContentService();
