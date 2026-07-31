import type { components } from '@perum/api-schema/tenant';
import { ApiClientError, type ApiClient } from '@perum/api-client';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../query/queryKeys';

export type StudentInventoryItem = components['schemas']['StudentInventoryItemOut'];
export type StudentInventory = StudentInventoryItem[];

export function studentInventoryPath(limit = 50) {
  return `/student/inventory/recent?limit=${Math.min(50, Math.max(1, Math.trunc(limit)))}`;
}

export function isInventoryUnavailable(error: unknown) {
  if (!(error instanceof ApiClientError) || error.status !== 404) return false;
  const data = error.originalErrorData;
  return Boolean(data && typeof data === 'object' && !Array.isArray(data) && 'detail' in data && (data as { detail?: unknown }).detail === 'Not Found');
}

export function shouldRetryInventory(failureCount: number, error: unknown) {
  if (failureCount >= 3) return false;
  if (error instanceof TypeError) return true;
  if (!(error instanceof ApiClientError)) return false;
  return error.status === 408 || error.status === 425 || error.status === 429 || error.status >= 500;
}

export function useStudentInventoryQuery(accountId: string, apiClient: ApiClient | null, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.studentRecentInventory(accountId),
    enabled: Boolean(accountId && apiClient && enabled),
    queryFn: () => apiClient!.get<StudentInventory>(studentInventoryPath()),
    retry: shouldRetryInventory,
  });
}

export function formatInventoryDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Дата неизвестна';
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

const itemTypeLabels: Record<string, string> = {
  avatar: 'Аватар',
  background: 'Фон',
  gift: 'Подарок',
};

const rarityLabels: Record<string, string> = {
  common: 'Обычная',
  rare: 'Редкая',
  epic: 'Эпическая',
  legendary: 'Легендарная',
};

export function inventoryDisplayDetails(item: Pick<StudentInventoryItem, 'item_type' | 'rarity'>) {
  return {
    itemType: itemTypeLabels[item.item_type] ?? 'Другой тип',
    rarity: rarityLabels[item.rarity] ?? 'Редкость не указана',
  };
}

export function inventoryAccessibilityLabel(item: StudentInventoryItem) {
  const details = inventoryDisplayDetails(item);
  return `${item.name}. Тип: ${details.itemType}. Редкость: ${details.rarity}. Количество: ${item.quantity}. ${item.equipped ? 'Экипировано.' : 'Не экипировано.'} Куплено: ${formatInventoryDate(item.purchased_at)}`;
}
