import assert from 'node:assert/strict';
import test from 'node:test';
import { workTypesPath, workTypeWeightLabel, type JournalWorkType } from './workTypesCore';

const workType = (weight: number): JournalWorkType => ({ id: 1, name: 'Контрольная работа', weight });

test('builds the exact journal work types path', () => assert.equal(workTypesPath(), '/journal/work-types'));

test('formats zero and fractional weights without changing their values', () => {
  assert.equal(workTypeWeightLabel(workType(0)), 'Вес: 0');
  assert.equal(workTypeWeightLabel(workType(1.5)), 'Вес: 1.5');
});
