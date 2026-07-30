import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiClientError } from '@perum/api-client';
import { formatTransactionAmount, formatTransactionDate, isTransactionsUnavailable, shouldRetryTransactions, studentTransactionsPath, transactionLabel } from './studentTransactionsCore';

test('builds a bounded recent transactions path', () => {
  assert.equal(studentTransactionsPath(), '/student/transactions/recent?limit=30');
  assert.equal(studentTransactionsPath(500), '/student/transactions/recent?limit=50');
  assert.equal(studentTransactionsPath(-1), '/student/transactions/recent?limit=1');
});

test('classifies only 404 as unavailable and never retries it', () => {
  const missing = new ApiClientError('not found', 404);
  assert.equal(isTransactionsUnavailable(missing), true);
  assert.equal(shouldRetryTransactions(0, missing), false);
  assert.equal(isTransactionsUnavailable(new ApiClientError('server', 500)), false);
  assert.equal(shouldRetryTransactions(0, new ApiClientError('server', 500)), true);
  assert.equal(shouldRetryTransactions(0, new TypeError('offline')), true);
  assert.equal(shouldRetryTransactions(3, new TypeError('offline')), false);
});

test('formats privacy-minimized transaction values safely', () => {
  assert.equal(transactionLabel({ reason: '  Олимпиада ', type: 'manual' }), 'Олимпиада');
  assert.equal(transactionLabel({ reason: null, type: 'purchase' }), 'Покупка в маркете');
  assert.equal(transactionLabel({ reason: null, type: 'unknown' }), 'Операция с балансом');
  assert.equal(formatTransactionAmount(12), '+12 лив.');
  assert.equal(formatTransactionAmount(-3), '-3 лив.');
  assert.equal(formatTransactionAmount(Number.NaN), '—');
  assert.equal(formatTransactionDate('invalid'), 'Дата неизвестна');
  assert.match(formatTransactionDate('2026-07-30T12:30:00Z'), /2026/);
});
