import { useNetInfo } from '@react-native-community/netinfo';
import type { components } from '@perum/api-schema/tenant';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../src/auth/AuthProvider';
import { useCapabilities } from '../../src/auth/CapabilityProvider';
import { FeatureUnavailable } from '../../src/components/FeatureUnavailable';
import { Screen } from '../../src/components/Screen';
import { queryKeys } from '../../src/query/queryKeys';
import { colors } from '../../src/theme';

type Diary = components['schemas']['TeacherDiaryOut'];

export default function TeacherDiaryScreen() {
  const { account, apiClient } = useAuth();
  const { has } = useCapabilities();
  const network = useNetInfo();
  const [weekOffset, setWeekOffset] = useState(0);
  const enabled = Boolean(account && apiClient && account.user.role === 'teacher' && has('teacher_diary'));
  const diary = useQuery({ queryKey: queryKeys.teacherDiary(account?.id ?? '', weekOffset), enabled, queryFn: () => apiClient!.get<Diary>(`/teacher/diary?week_offset=${weekOffset}`) });
  if (!has('teacher_diary')) return <FeatureUnavailable />;
  if (!account || !apiClient || account.user.role !== 'teacher') return null;
  const days = Object.values(diary.data?.diary ?? {});
  return <Screen>
    <Pressable onPress={() => router.back()}><Text style={styles.back}>Назад</Text></Pressable>
    <Text style={styles.title}>Расписание учителя</Text>
    <View style={styles.week}><Pressable onPress={() => setWeekOffset(value => value - 1)}><Text style={styles.action}>Предыдущая</Text></Pressable><Pressable disabled={weekOffset === 0} onPress={() => setWeekOffset(0)}><Text style={styles.current}>Текущая неделя</Text></Pressable><Pressable onPress={() => setWeekOffset(value => value + 1)}><Text style={styles.action}>Следующая</Text></Pressable></View>
    {network.isConnected === false ? <Text style={styles.offline}>Офлайн: показаны последние сохранённые данные этой недели.</Text> : null}
    {diary.isLoading ? <Text style={styles.muted}>Загрузка…</Text> : null}
    {diary.isError && !diary.data ? <View style={styles.card}><Text style={styles.error}>Не удалось загрузить расписание.</Text><Pressable onPress={() => void diary.refetch()}><Text style={styles.action}>Повторить</Text></Pressable></View> : null}
    {diary.data ? <Text style={styles.period}>{diary.data.week_start} – {diary.data.week_end}</Text> : null}
    {diary.data && !days.some(day => day.lessons.length) ? <View style={styles.card}><Text style={styles.muted}>На этой неделе уроков нет.</Text></View> : null}
    {days.map(day => day.lessons.length ? <View key={day.date} style={styles.card}><Text style={styles.cardTitle}>{day.day_name} · {day.date}</Text>{day.lessons.map((lesson, index) => <View key={`${lesson.occurrence_id ?? 'lesson'}-${index}`} style={styles.lesson}><View style={styles.lessonMain}><Text style={styles.subject}>{lesson.subject_name ?? 'Предмет'}</Text><Text style={styles.meta}>{lesson.class_name ?? 'Класс'} · {lesson.room ?? 'кабинет не указан'}</Text>{lesson.homework[0] ? <Text style={styles.homework}>ДЗ: {lesson.homework[0].title}</Text> : null}{lesson.control_work ? <Text style={styles.control}>Контрольная: {lesson.control_work.title ?? lesson.control_work.work_type}</Text> : null}</View><Text style={styles.time}>{lesson.status === 'cancelled' ? 'Отменён' : lesson.start_time ?? `${lesson.lesson_number} урок`}</Text></View>)}</View> : null)}
  </Screen>;
}

const styles = StyleSheet.create({
  back: { color: colors.primary, fontSize: 15, fontWeight: '700', marginBottom: 12 }, title: { color: colors.ink, fontSize: 30, fontWeight: '800' }, week: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 14 }, action: { color: colors.primary, fontWeight: '800' }, current: { color: colors.muted, fontSize: 12 }, offline: { color: colors.danger, backgroundColor: colors.surface, borderRadius: 12, padding: 12 }, period: { color: colors.muted, marginTop: 8 }, card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 16, marginTop: 12 }, cardTitle: { color: colors.ink, fontSize: 18, fontWeight: '800' }, lesson: { flexDirection: 'row', borderTopColor: colors.border, borderTopWidth: 1, paddingVertical: 11 }, lessonMain: { flex: 1 }, subject: { color: colors.ink, fontWeight: '800' }, meta: { color: colors.muted, marginTop: 3 }, homework: { color: colors.ink, marginTop: 6 }, control: { color: colors.danger, marginTop: 4 }, time: { color: colors.primary, fontWeight: '700', marginLeft: 10 }, muted: { color: colors.muted, marginTop: 8 }, error: { color: colors.danger },
});
