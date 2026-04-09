import apiClient from '../api';

export type AdminSettingRow = {
  id: string;
  key: string;
  value: string | null;
  category: string | null;
  isEncrypted: boolean;
  updatedAt: string;
};

export async function fetchAdminSettings(): Promise<AdminSettingRow[]> {
  const { data } = await apiClient.get<AdminSettingRow[]>('/admin/settings');
  return data;
}

export async function fetchAdminSettingsAdvanced(params?: {
  search?: string;
  category?: string;
  limit?: number;
  offset?: number;
}): Promise<AdminSettingRow[]> {
  const { data } = await apiClient.get<AdminSettingRow[]>('/admin/settings', {
    params,
  });
  return data;
}

export async function upsertAdminSetting(payload: {
  key: string;
  value?: string;
  category?: string;
  isEncrypted?: boolean;
}): Promise<AdminSettingRow> {
  const { data } = await apiClient.put<AdminSettingRow>(
    '/admin/settings/upsert',
    payload,
  );
  return data;
}

export async function createAdminSetting(payload: {
  key: string;
  value?: string;
  category?: string;
  isEncrypted?: boolean;
}): Promise<AdminSettingRow> {
  const { data } = await apiClient.post<AdminSettingRow>('/admin/settings', payload);
  return data;
}

export async function patchAdminSetting(
  id: string,
  payload: {
    key?: string;
    value?: string;
    category?: string;
    isEncrypted?: boolean;
  },
): Promise<AdminSettingRow> {
  const { data } = await apiClient.patch<AdminSettingRow>(`/admin/settings/${id}`, payload);
  return data;
}

export async function deleteAdminSetting(id: string): Promise<void> {
  await apiClient.delete(`/admin/settings/${id}`);
}

export type AdminSettingsAuditRow = {
  id: string;
  settingId: string | null;
  settingKey: string;
  action: 'create' | 'update' | 'delete' | 'upsert';
  actorUserId: string | null;
  actorEmail: string | null;
  oldValue: string | null;
  newValue: string | null;
  oldValueRedacted: boolean;
  newValueRedacted: boolean;
  wasEncrypted: boolean;
  createdAt: string;
};

export async function fetchAdminSettingsAudit(params?: {
  key?: string;
  action?: 'create' | 'update' | 'delete' | 'upsert';
  actorUserId?: string;
  limit?: number;
  offset?: number;
}): Promise<{ rows: AdminSettingsAuditRow[]; total: number }> {
  const { data } = await apiClient.get<{ rows: AdminSettingsAuditRow[]; total: number }>(
    '/admin/settings-audit',
    { params },
  );
  return data;
}

/** Skip API write when the field still shows a mask-only placeholder (accidental save). */
export function isMaskedPlaceholder(value: string): boolean {
  const t = value.trim();
  return t.length >= 6 && /^\*+$/.test(t);
}
