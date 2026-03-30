import { apiClient } from '../api';

export interface CreateVideoDto {
  prompt: string;
  type: 'text' | 'image' | 'multi-image';
  images?: string[];
  duration: number;
  model: string;
  platform?: string;
}

export interface VideoResponse {
  id: string;
  prompt: string;
  duration: number;
  status: 'pending' | 'processing' | 'done' | 'failed';
  videoUrl?: string;
  metadata?: any;
}

export const videoApi = {
  generateVideo: async (dto: CreateVideoDto) => {
    return apiClient.post<VideoResponse>('/video/generate', dto);
  },

  getVideoStatus: async (id: string) => {
    return apiClient.get<VideoResponse>(`/video/${id}`);
  },
};
