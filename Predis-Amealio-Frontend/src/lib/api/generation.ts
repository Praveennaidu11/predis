import { apiClient } from '../api';

export type GenerationRecipe =
  | 'text_to_image'
  | 'image_to_image'
  | 'text_to_video'
  | 'first_last_prompt_to_video'
  | 'first_last_to_video'
  | 'ugc_create';

export type GenerationJobStatus = 'queued' | 'processing' | 'done' | 'failed';

export type CreateGenerationJobDto = {
  recipe: GenerationRecipe;
  prompt?: string;
  provider?: string;
  model?: string;
  platform?: string;
  duration?: number;
  input?: {
    inputImage?: string;
    firstFrame?: string;
    lastFrame?: string;
    images?: string[];
    [key: string]: any;
  };
};

export type GenerationJob = {
  id: string;
  userId: string | null;
  requestedRole: string | null;
  recipe: GenerationRecipe;
  status: GenerationJobStatus;
  prompt: string | null;
  provider: string | null;
  model: string | null;
  platform: string | null;
  duration: number | null;
  input: any;
  output: any;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PromptHistory = {
  id: string;
  prompt: string;
  platform: string;
  recipe: string;
  createdAt: string;
};

export const generationApi = {
  createJob: (dto: CreateGenerationJobDto) => apiClient.post<GenerationJob>('/generation/jobs', dto),
  getJob: (id: string) => apiClient.get<GenerationJob>(`/generation/jobs/${id}`),
  getPromptHistory: () => apiClient.get<PromptHistory[]>('/merchant/prompt-history'),
  clearPromptHistory: () => apiClient.delete('/merchant/prompt-history'),
};

