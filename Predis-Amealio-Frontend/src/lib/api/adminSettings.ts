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

/** Skip API write when the field still shows a mask-only placeholder (accidental save). */
export function isMaskedPlaceholder(value: string): boolean {
  const t = value.trim();
  return t.length >= 6 && /^\*+$/.test(t);
}
