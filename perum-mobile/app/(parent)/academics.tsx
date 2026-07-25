import { useNetInfo } from '@react-native-community/netinfo';
import type { components } from '@perum/api-schema/tenant';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../src/auth/AuthProvider';
import { useCapabilities } from '../../src/auth/CapabilityProvider';
import { FeatureUnavailable } from '../../src/components/FeatureUnavailable';
import { Screen } from '../../src/components/Screen';
import { queryKeys } from '../../src/query/queryKeys';
import { colors } from '../../src/theme';
import { selectParentChild } from '../../src/academics/parentCore';

type Children = components['schemas']['ParentChildrenOut'];
type Diary = components['schemas']['StudentDiaryOut'];
type Grades = components['schemas']['StudentGradesOut'];
type Finals = components['schemas']['StudentFinalGradesOut'];

export default function ParentAcademicsScreen() {
  const { account, apiClient } = useAuth();
  const { has } = useCapabilities();
  const network = useNetInfo();
  const [childId, setChildId] = useState<number | null>(null);
  const enabled = Boolean(account && apiClient && account.user.role === 'parent' && has('parent_academics'));
  const children = useQuery({ queryKey: queryKeys.parentChildren(account?.id ?? ''), enabled, queryFn: () => apiClient!.get<Children>('/parent/children') });
  useEffect(() => { const next = selectParentChild(children.data?.children ?? [], childId); if (next !== childId) setChildId(next); }, [children.data, childId]);
  const loadChild = enabled && childId !== null;
  const diary = useQuery({ queryKey: queryKeys.parentDiary(account?.id ?? '', childId ?? 0), enabled: loadChild, queryFn: () => apiClient!.get<Diary>(`/parent/children/${childId}/diary`) });
  const grades = useQuery({ queryKey: queryKeys.parentGrades(account?.id ?? '', childId ?? 0), enabled: loadChild, queryFn: () => apiClient!.get<Grades>(`/parent/children/${childId}/grades`) });
  const finals = useQuery({ queryKey: queryKeys.parentFinals(account?.id ?? '', childId ?? 0), enabled: loadChild, queryFn: () => apiClient!.get<Finals>(`/parent/children/${childId}/grades/finals`) });
  if (!has('parent_academics')) return <FeatureUnavailable />;
  if (!account || !apiClient || account.user.role !== 'parent') return null;
  const lessons = Object.values(diary.data?.diary ?? {}).flatMap(day => day.lessons);
  const failed = children.isError || diary.isError || grades.isError || finals.isError;
  return <Screen>
    <Pressable onPress={() => router.back()}><Text style={styles.back}>Назад</Text></Pressable>
    <Text style={styles.title}>Успеваемость детей</Text>
    {network.isConnected === false ? <Text style={styles.offline}>Офлайн: показаны последние сохранённые данные.</Text> : null}
    {children.isLoading ? <Text style={styles.muted}>Загрузка…</Text> : null}
    {children.isError && !children.data ? <View style={styles.card}><Text style={styles.error}>Не удалось загрузить список детей.</Text><Pressable onPress={() => void children.refetch()}><Text style={styles.action}>Повторить</Text></Pressable></View> : null}
    {children.data && !children.data.children.length ? <View style={styles.card}><Text style={styles.cardTitle}>Нет привязанных детей</Text><Text style={styles.muted}>Обратитесь к администратору школы.</Text></View> : null}
    {children.data && children.data.children.length > 0 ? <View style={styles.selector}>{children.data.children.map(child => <Pressable key={child.id} onPress={() => setChildId(child.id)} style={[styles.child, child.id === childId && styles.childActive]}><Text style={[styles.childText, child.id === childId && styles.childTextActive]}>{[child.last_name, child.first_name].filter(Boolean).join(' ') || `Ученик ${child.id}`}</Text></Pressable>)}</View> : null}
    {failed && childId !== null && !diary.data && !grades.data && !finals.data ? <View style={styles.card}><Text style={styles.error}>Не удалось загрузить данные ребёнка.</Text><Pressable onPress={() => void Promise.all([diary.refetch(), grades.refetch(), finals.refetch()])}><Text style={styles.action}>Повторить</Text></Pressable></View> : null}
    {diary.data ? <View style={styles.card}><Text style={styles.cardTitle}>Неделя {diary.data.week_start} – {diary.data.week_end}</Text>{lessons.length ? lessons.map((lesson, index) => <View key={`${lesson.occurrence_id ?? 'lesson'}-${index}`} style={styles.row}><Text style={styles.subject}>{lesson.subject_name}</Text><Text style={styles.meta}>{lesson.status === 'cancelled' ? 'Отменён' : lesson.start_time ?? `Урок ${lesson.lesson_number}`}</Text></View>) : <Text style={styles.muted}>Уроков на этой неделе нет.</Text>}</View> : null}
    {grades.data ? <View style={styles.card}><Text style={styles.cardTitle}>Оценки</Text>{grades.data.grades.length ? grades.data.grades.slice(0, 12).map(grade => <View key={grade.id} style={styles.row}><Text style={styles.subject}>{grade.subject_name}</Text><Text style={styles.grade}>{grade.value ?? '·'}</Text></View>) : <Text style={styles.muted}>Оценок пока нет.</Text>}</View> : null}
    {finals.data ? <View style={styles.card}><Text style={styles.cardTitle}>Итоговые оценки</Text>{finals.data.final_grades.length ? finals.data.final_grades.map(grade => <View key={grade.id} style={styles.row}><Text style={styles.subject}>{grade.subject_name}</Text><Text style={styles.grade}>{grade.grade_value}</Text></View>) : <Text style={styles.muted}>Итоговых оценок пока нет.</Text>}</View> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  back: { color: colors.primary, fontSize: 15, fontWeight: '700', marginBottom: 12 }, title: { color: colors.ink, fontSize: 30, fontWeight: '800', marginBottom: 14 }, offline: { color: colors.danger, backgroundColor: colors.surface, borderRadius: 12, padding: 12 }, selector: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }, child: { borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: 10 }, childActive: { backgroundColor: colors.primary, borderColor: colors.primary }, childText: { color: colors.ink, fontWeight: '700' }, childTextActive: { color: colors.white }, card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 16, marginTop: 12 }, cardTitle: { color: colors.ink, fontSize: 18, fontWeight: '800', marginBottom: 8 }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopColor: colors.border, borderTopWidth: 1, paddingVertical: 10 }, subject: { color: colors.ink, flex: 1, fontWeight: '600' }, meta: { color: colors.muted, marginLeft: 12 }, grade: { color: colors.primary, fontSize: 19, fontWeight: '800', marginLeft: 12 }, muted: { color: colors.muted, marginTop: 8 }, error: { color: colors.danger }, action: { color: colors.primary, fontWeight: '800', marginTop: 10 },
});
