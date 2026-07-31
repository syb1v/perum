import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiClientError } from '@perum/api-client';
import { formatInventoryDate, inventoryAccessibilityLabel, inventoryDisplayDetails, isInventoryUnavailable, shouldRetryInventory, studentInventoryPath } from './studentInventoryCore';

test('builds a bounded recent inventory path', () => {
  assert.equal(studentInventoryPath(), '/student/inventory/recent?limit=50');
  assert.equal(studentInventoryPath(500), '/student/inventory/recent?limit=50');
  assert.equal(studentInventoryPath(-1), '/student/inventory/recent?limit=1');
});

test('classifies only generic router 404 as unavailable and never retries it', () => {
  const missing = new ApiClientError('not found', 404, { detail: 'Not Found' });
  assert.equal(isInventoryUnavailable(missing), true);
  assert.equal(shouldRetryInventory(0, missing), false);
  assert.equal(isInventoryUnavailable(new ApiClientError('domain', 404, { detail: 'Инвентарь недоступен' })), false);
  assert.equal(isInventoryUnavailable(new ApiClientError('malformed', 404, { detail: ['Not Found'] })), false);
  assert.equal(isInventoryUnavailable(new ApiClientError('empty', 404)), false);
  assert.equal(shouldRetryInventory(0, new ApiClientError('server', 500)), true);
  assert.equal(shouldRetryInventory(0, new ApiClientError('timeout', 408)), true);
  assert.equal(shouldRetryInventory(0, new ApiClientError('early', 425)), true);
  assert.equal(shouldRetryInventory(0, new ApiClientError('limited', 429)), true);
  assert.equal(shouldRetryInventory(0, new ApiClientError('unauthorized', 401)), false);
  assert.equal(shouldRetryInventory(0, new ApiClientError('domain', 404, { detail: 'Инвентарь недоступен' })), false);
  assert.equal(shouldRetryInventory(3, new TypeError('offline')), false);
  assert.equal(shouldRetryInventory(0, new TypeError('offline')), true);
  assert.equal(shouldRetryInventory(0, new Error('unknown')), false);
});

test('formats inventory dates and accessible item details safely', () => {
  assert.equal(formatInventoryDate('invalid'), 'Дата неизвестна');
  assert.match(formatInventoryDate('2026-07-30T12:30:00Z'), /2026/);
  assert.deepEqual(inventoryDisplayDetails({ item_type: 'gift', rarity: 'rare' }), { itemType: 'Подарок', rarity: 'Редкая' });
  assert.deepEqual(inventoryDisplayDetails({ item_type: 'private_code', rarity: 'internal_tier' }), { itemType: 'Другой тип', rarity: 'Редкость не указана' });
  const unknown = { id: 1, name: 'Рюкзак', item_type: 'private_code', rarity: 'internal_tier', quantity: 2, equipped: false, purchased_at: '2026-07-30T12:30:00Z' };
  const label = inventoryAccessibilityLabel(unknown);
  assert.equal(label, 'Рюкзак. Тип: Другой тип. Редкость: Редкость не указана. Количество: 2. Не экипировано. Куплено: 30 июл. 2026 г.');
  assert.doesNotMatch(label, /private_code|internal_tier/);
});
