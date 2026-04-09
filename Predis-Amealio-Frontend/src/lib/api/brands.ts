import apiClient from '../api';

export type Brand = {
  id: string;
  userId: string;
  name: string;
  logo?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  fontFamily?: string | null;
  createdAt: string;
};

export type CreateBrandDto = {
  name: string;
  logo?: string;
  primaryColor?: string;
  secondaryColor?: string;
  fontFamily?: string;
};

export type UpdateBrandDto = Partial<CreateBrandDto>;

export const brandsApi = {
  list: (params?: { trash?: boolean }) =>
    apiClient.get<Brand[]>('/merchant/brands', {
      params: params?.trash ? { trash: '1' } : undefined,
    }),
  create: (dto: CreateBrandDto) => apiClient.post<Brand>('/merchant/brands', dto),
  update: (id: string, dto: UpdateBrandDto) =>
    apiClient.patch<Brand>(`/merchant/brands/${id}`, dto),
  remove: (id: string) => apiClient.delete(`/merchant/brands/${id}`),
  restore: (id: string) => apiClient.post<Brand>(`/merchant/brands/${id}/restore`),
  uploadLogo: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return apiClient.post<Brand>(`/merchant/brands/${id}/logo`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

