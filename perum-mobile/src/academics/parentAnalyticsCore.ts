import type { components } from '@perum/api-schema/tenant';

export type ParentChildren = components['schemas']['ParentChildrenOut'];
export type ParentGradesSummary = components['schemas']['GradesSummaryOut'];
export type ParentGradesAnalytics = components['schemas']['GradesAnalyticsOut'];
export type ParentTransactions = components['schemas']['ParentTransactionsOut'];
export type ParentTransaction = components['schemas']['ParentTransactionOut'];

export function parentSummaryPath(childId: number) { return `/parent/children/${childId}/grades/summary`; }
export function parentAnalyticsPath(childId: number) { return `/parent/children/${childId}/grades/analytics`; }
export function parentTransactionsPath(childId: number) { return `/parent/children/${childId}/transactions`; }

export function periodGrade(periods: Record<string, number | null>, periodId: number) {
  return periods[String(periodId)] ?? null;
}

export function transactionLabel(transaction: ParentTransaction) {
  return transaction.reason || transaction.type;
}

export function formatTransactionAmount(amount: number) {
  return amount > 0 ? `+${amount}` : String(amount);
}

export function formatTransactionDate(value: string | null) {
  if (!value) return 'Дата не указана';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
