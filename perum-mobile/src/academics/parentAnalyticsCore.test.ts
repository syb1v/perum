import assert from 'node:assert/strict';
import test from 'node:test';
import { formatTransactionAmount, formatTransactionDate, parentAnalyticsPath, parentSummaryPath, parentTransactionsPath, periodGrade, transactionLabel, type ParentTransaction } from './parentAnalyticsCore';

const transaction = (overrides: Partial<ParentTransaction> = {}): ParentTransaction => ({ id: 1, amount: 5, balance_after: 20, type: 'grade', reason: null, created_at: null, ...overrides });

test('builds exact linked-child read paths', () => {
  assert.equal(parentSummaryPath(7), '/parent/children/7/grades/summary');
  assert.equal(parentAnalyticsPath(7), '/parent/children/7/grades/analytics');
  assert.equal(parentTransactionsPath(7), '/parent/children/7/transactions');
});

test('reads period maps by stringified authoritative id', () => {
  assert.equal(periodGrade({ '2': 4.5 }, 2), 4.5);
  assert.equal(periodGrade({ '2': null }, 2), null);
  assert.equal(periodGrade({}, 2), null);
});

test('formats transaction labels, amounts and nullable dates safely', () => {
  assert.equal(transactionLabel(transaction({ reason: 'Награда' })), 'Награда');
  assert.equal(transactionLabel(transaction()), 'grade');
  assert.equal(formatTransactionAmount(5), '+5');
  assert.equal(formatTransactionAmount(-3), '-3');
  assert.equal(formatTransactionAmount(0), '0');
  assert.equal(formatTransactionDate(null), 'Дата не указана');
  assert.equal(formatTransactionDate('invalid'), 'invalid');
});
