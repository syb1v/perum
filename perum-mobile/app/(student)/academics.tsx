import { useNetInfo } from '@react-native-community/netinfo';
import type { components } from '@perum/api-schema/tenant';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../src/auth/AuthProvider';
import { useCapabilities } from '../../src/auth/CapabilityProvider';
import { FeatureUnavailable } from '../../src/components/FeatureUnavailable';
import { Screen } from '../../src/components/Screen';
import { queryKeys } from '../../src/query/queryKeys';
import { colors } from '../../src/theme';

type Diary = components['schemas']['StudentDiaryOut'];
type Grades = components['schemas']['StudentGradesOut'];
type Finals = components['schemas']['StudentFinalGradesOut'];

export default function StudentAcademicsScreen() {
  const { account, apiClient } = useAuth();
  const { has } = useCapabilities();
  const network = useNetInfo();
  const enabled = Boolean(account && apiClient && account.user.role === 'student' && has('student_academics'));
  const diary = useQuery({ queryKey: queryKeys.studentDiary(account?.id ?? ''), enabled, queryFn: () => apiClient!.get<Diary>('/student/diary') });
  const grades = useQuery({ queryKey: queryKeys.studentGrades(account?.id ?? ''), enabled, queryFn: () => apiClient!.get<Grades>('/student/grades') });
  const finals = useQuery({ queryKey: queryKeys.studentFinals(account?.id ?? ''), enabled, queryFn: () => apiClient!.get<Finals>('/student/grades/finals') });
  if (!has('student_academics')) return <FeatureUnavailable />;
  if (!account || !apiClient || account.user.role !== 'student') return null;
  const loading = diary.isLoading || grades.isLoading || finals.isLoading;
  const failed = diary.isError || grades.isError || finals.isError;
  const lessons = Object.values(diary.data?.diary ?? {}).flatMap(day => day.lessons);
  return <Screen>
    <Pressable onPress={() => router.back()}><Text style={styles.back}>Назад</Text></Pressable>
    <Text style={styles.title}>Дневник и оценки</Text>
    {network.isConnected === false ? <Text style={styles.offline}>Офлайн: показаны последние сохранённые данные.</Text> : null}
    {loading ? <Text style={styles.muted}>Загрузка…</Text> : null}
    {failed && !diary.data && !grades.data && !finals.data ? <View style={styles.card}><Text style={styles.error}>Не удалось загрузить учебные данные.</Text><Pressable onPress={() => void Promise.all([diary.refetch(), grades.refetch(), finals.refetch()])}><Text style={styles.action}>Повторить</Text></Pressable></View> : null}
    {diary.data ? <View style={styles.card}><Text style={styles.cardTitle}>Неделя {diary.data.week_start} – {diary.data.week_end}</Text>{lessons.length ? lessons.map((lesson, index) => <View key={`${lesson.occurrence_id ?? 'lesson'}-${index}`} style={styles.row}><Text style={styles.subject}>{lesson.subject_name}</Text><Text style={styles.meta}>{lesson.status === 'cancelled' ? 'Отменён' : lesson.start_time ?? `Урок ${lesson.lesson_number}`}</Text></View>) : <Text style={styles.muted}>Уроков на этой неделе нет.</Text>}</View> : null}
    {grades.data ? <View style={styles.card}><Text style={styles.cardTitle}>Последние оценки</Text>{grades.data.grades.length ? grades.data.grades.slice(0, 12).map(grade => <View key={grade.id} style={styles.row}><Text style={styles.subject}>{grade.subject_name}</Text><Text style={styles.grade}>{grade.value ?? '·'}</Text></View>) : <Text style={styles.muted}>Оценок пока нет.</Text>}</View> : null}
    {finals.data ? <View style={styles.card}><Text style={styles.cardTitle}>Итоговые оценки</Text>{finals.data.final_grades.length ? finals.data.final_grades.map(grade => <View key={grade.id} style={styles.row}><Text style={styles.subject}>{grade.subject_name}</Text><Text style={styles.grade}>{grade.grade_value}</Text></View>) : <Text style={styles.muted}>Итоговых оценок пока нет.</Text>}</View> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  back: { color: colors.primary, fontSize: 15, fontWeight: '700', marginBottom: 12 }, title: { color: colors.ink, fontSize: 30, fontWeight: '800', marginBottom: 14 }, offline: { color: colors.danger, backgroundColor: colors.surface, borderRadius: 12, padding: 12 }, card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 16, marginTop: 12 }, cardTitle: { color: colors.ink, fontSize: 18, fontWeight: '800', marginBottom: 8 }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopColor: colors.border, borderTopWidth: 1, paddingVertical: 10 }, subject: { color: colors.ink, flex: 1, fontWeight: '600' }, meta: { color: colors.muted, marginLeft: 12 }, grade: { color: colors.primary, fontSize: 19, fontWeight: '800', marginLeft: 12 }, muted: { color: colors.muted, marginTop: 8 }, error: { color: colors.danger }, action: { color: colors.primary, fontWeight: '800', marginTop: 10 },
});
