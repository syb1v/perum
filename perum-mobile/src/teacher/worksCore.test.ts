import assert from 'node:assert/strict';
import test from 'node:test';
import { formatTeacherWorkDate, mergeTeacherWorks, nextTeacherWorksOffset, teacherWorksPath, type TeacherWork, type TeacherWorksPage } from './worksCore';

const work = (id: string): TeacherWork => ({ id, type: 'homework', class_id: 1, class_name: null, subject_id: 2, subject_name: null, title: id, description: null, due_date: null, created_at: null });
const page = (ids: string[], hasMore: boolean): TeacherWorksPage => ({ works: ids.map(work), has_more: hasMore });

test('builds a bounded teacher works page request', () => {
  assert.equal(teacherWorksPath(40), '/teacher/works?limit=20&offset=40');
});

test('derives the next offset from received rows and stops on the last page', () => {
  const pages = [page(['hw_1', 'hw_2'], true), page(['cw_1'], true)];
  assert.equal(nextTeacherWorksOffset(pages, pages[1]!), 3);
  assert.equal(nextTeacherWorksOffset([page([], false)], page([], false)), undefined);
});

test('deduplicates works when mutable offset pages overlap', () => {
  assert.deepEqual(mergeTeacherWorks([page(['hw_1', 'cw_1'], true), page(['cw_1', 'hw_2'], false)]).map((item) => item.id), ['hw_1', 'cw_1', 'hw_2']);
});

test('formats date-only values without a timezone shift', () => {
  assert.equal(formatTeacherWorkDate('2026-07-25'), '25.07.2026');
  assert.equal(formatTeacherWorkDate(null), 'Дата не указана');
  assert.equal(formatTeacherWorkDate('unknown'), 'unknown');
});
