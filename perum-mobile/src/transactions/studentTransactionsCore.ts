import type { components } from '@perum/api-schema/tenant';
import { ApiClientError, type ApiClient } from '@perum/api-client';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../query/queryKeys';

export type StudentTransaction = components['schemas']['StudentRecentTransactionOut'];
export type StudentTransactions = StudentTransaction[];

export function studentTransactionsPath(limit = 30) {
  return `/student/transactions/recent?limit=${Math.min(50, Math.max(1, Math.trunc(limit)))}`;
}

export function isTransactionsUnavailable(error: unknown) {
  return error instanceof ApiClientError && error.status === 404;
}

export function shouldRetryTransactions(failureCount: number, error: unknown) {
  return !isTransactionsUnavailable(error) && failureCount < 3;
}

export function useStudentTransactionsQuery(accountId: string, apiClient: ApiClient | null, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.studentRecentTransactions(accountId),
    enabled: Boolean(accountId && apiClient && enabled),
    queryFn: () => apiClient!.get<StudentTransactions>(studentTransactionsPath()),
    retry: shouldRetryTransactions,
  });
}

export function transactionLabel(transaction: Pick<StudentTransaction, 'reason' | 'type'>) {
  if (transaction.reason?.trim()) return transaction.reason.trim();
  const labels: Record<string, string> = {
    grade: 'Начисление за оценку',
    quest: 'Награда за задание',
    purchase: 'Покупка в маркете',
    exchange_invest: 'Инвестиция',
    exchange_result: 'Результат инвестиции',
    manual: 'Изменение баланса',
  };
  return labels[transaction.type] ?? 'Операция с балансом';
}

export function formatTransactionAmount(amount: number) {
  if (!Number.isFinite(amount)) return '—';
  return `${amount > 0 ? '+' : ''}${amount} лив.`;
}

export function formatTransactionDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Дата неизвестна';
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}
