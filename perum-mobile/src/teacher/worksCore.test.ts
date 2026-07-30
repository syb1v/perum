import assert from 'node:assert/strict';
import test from 'node:test';
import { queryKeys } from '../query/queryKeys';
import { formatTeacherWorkDate, mergeTeacherWorks, nextTeacherWorksOffset, normalizeTeacherWorksFilter, selectedTeacherWork, teacherWorksPath, type TeacherWork, type TeacherWorksClass, type TeacherWorksPage } from './worksCore';

const work = (id: string): TeacherWork => ({ id, type: 'homework', class_id: 1, class_name: null, subject_id: 2, subject_name: null, title: id, description: null, due_date: null, created_at: null });
const page = (ids: string[], hasMore: boolean): TeacherWorksPage => ({ works: ids.map(work), has_more: hasMore });

test('builds a bounded teacher works page request', () => {
  assert.equal(teacherWorksPath(40), '/teacher/works?limit=20&offset=40');
  assert.equal(teacherWorksPath(-3, { classId: 7, subjectId: null }), '/teacher/works?class_id=7&limit=20&offset=0');
  assert.equal(teacherWorksPath(20.8, { classId: 7, subjectId: 11 }), '/teacher/works?class_id=7&subject_id=11&limit=20&offset=20');
});

test('isolates teacher works infinite queries by account and normalized filters', () => {
  assert.deepEqual(queryKeys.teacherWorks('account-a', null, null), ['account', 'account-a', 'academics', 'teacher-works']);
  assert.deepEqual(queryKeys.teacherWorks('account-a', 7, null), ['account', 'account-a', 'academics', 'teacher-works', 7, null]);
  assert.notDeepEqual(queryKeys.teacherWorks('account-a', 7, null), queryKeys.teacherWorks('account-a', 7, 11));
  assert.notDeepEqual(queryKeys.teacherWorks('account-a', 7, 11), queryKeys.teacherWorks('account-b', 7, 11));
});

test('normalizes stale classes and subjects and constrains subjects to the selected class', () => {
  const classes = [
    { id: 7, name: '7А', grade_level: 7, subjects: [{ id: 11, name: 'Алгебра', short_name: null, category: 'exact' }] },
    { id: 8, name: '8А', grade_level: 8, subjects: [{ id: 12, name: 'Физика', short_name: null, category: 'exact' }] },
  ] satisfies TeacherWorksClass[];
  assert.deepEqual(normalizeTeacherWorksFilter(classes, { classId: null, subjectId: 11 }), { classId: null, subjectId: null });
  assert.deepEqual(normalizeTeacherWorksFilter(classes, { classId: 7, subjectId: 12 }), { classId: 7, subjectId: null });
  assert.deepEqual(normalizeTeacherWorksFilter(classes, { classId: 7, subjectId: 11 }), { classId: 7, subjectId: 11 });
  assert.deepEqual(normalizeTeacherWorksFilter(classes, { classId: 99, subjectId: 11 }), { classId: null, subjectId: null });
});

test('derives the next offset from received rows and stops on the last page', () => {
  const pages = [page(['hw_1', 'hw_2'], true), page(['cw_1'], true)];
  assert.equal(nextTeacherWorksOffset(pages, pages[1]!), 3);
  assert.equal(nextTeacherWorksOffset([page([], false)], page([], false)), undefined);
});

test('deduplicates works when mutable offset pages overlap', () => {
  assert.deepEqual(mergeTeacherWorks([page(['hw_1', 'cw_1'], true), page(['cw_1', 'hw_2'], false)]).map((item) => item.id), ['hw_1', 'cw_1', 'hw_2']);
});

test('resolves detail only from loaded works and falls back for stale selection', () => {
  const works = [work('hw_1'), work('cw_1')];
  assert.equal(selectedTeacherWork(works, 'cw_1')?.id, 'cw_1');
  assert.equal(selectedTeacherWork(works, 'missing'), null);
  assert.equal(selectedTeacherWork(works, null), null);
});

test('formats date-only values without a timezone shift', () => {
  assert.equal(formatTeacherWorkDate('2026-07-25'), '25.07.2026');
  assert.equal(formatTeacherWorkDate('2026-07-25T10:30:00Z'), new Date('2026-07-25T10:30:00Z').toLocaleDateString('ru-RU'));
  assert.equal(formatTeacherWorkDate(null), 'Дата не указана');
  assert.equal(formatTeacherWorkDate('unknown'), 'unknown');
});
