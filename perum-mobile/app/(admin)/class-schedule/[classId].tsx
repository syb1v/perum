import { useNetInfo } from '@react-native-community/netinfo';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { classScheduleDays, classScheduleLessons, isClassNotFound, isClassScheduleUnavailable, normalizeClassId, useClassScheduleQuery } from '../../../src/admin/classScheduleCore';
import { useAuth } from '../../../src/auth/AuthProvider';
import { useCapabilities } from '../../../src/auth/CapabilityProvider';
import { FeatureUnavailable } from '../../../src/components/FeatureUnavailable';
import { Screen } from '../../../src/components/Screen';
import { colors } from '../../../src/theme';

export default function ClassScheduleScreen() {
  const { classId: rawClassId } = useLocalSearchParams<{ classId: string | string[] }>();
  const classId = normalizeClassId(rawClassId);
  const { account, apiClient } = useAuth();
  const { has } = useCapabilities();
  const network = useNetInfo();
  const eligible = Boolean(account && (account.user.role === 'school_admin' || account.user.role === 'director'));
  const schedule = useClassScheduleQuery(account?.id ?? '', classId, apiClient, eligible && has('school_admin_class_directory'));
  if (!classId || !account || !apiClient || !eligible || !has('school_admin_class_directory')) return <FeatureUnavailable />;
  if (schedule.isError && isClassScheduleUnavailable(schedule.error)) return <FeatureUnavailable />;
  if (schedule.isError && isClassNotFound(schedule.error)) return <Screen><View style={styles.content}>
    <Pressable accessibilityRole="button" accessibilityLabel="Назад к классам" hitSlop={8} style={styles.backTarget} onPress={() => router.back()}><Text style={styles.back}>Назад</Text></Pressable>
    <View style={styles.card}><Text accessibilityRole="header" style={styles.cardTitle}>Класс не найден</Text><Text style={styles.muted}>Возможно, класс больше не доступен в каталоге школы.</Text></View>
  </View></Screen>;
  return <Screen><ScrollView contentContainerStyle={styles.content}>
    <Pressable accessibilityRole="button" accessibilityLabel="Назад к классам" hitSlop={8} style={styles.backTarget} onPress={() => router.back()}><Text style={styles.back}>Назад</Text></Pressable>
    <Text accessibilityRole="header" style={styles.title}>Расписание класса</Text>
    {schedule.data ? <Text style={styles.subtitle}>{schedule.data.class_name}</Text> : null}
    {network.isConnected === false ? <Text style={styles.offline}>Расписание не хранится на устройстве.</Text> : null}
    {schedule.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
    {schedule.isError && !schedule.data ? <View style={styles.card}><Text style={styles.error}>Не удалось загрузить расписание.</Text><Pressable accessibilityRole="button" accessibilityLabel="Повторить загрузку расписания" style={styles.retryTarget} onPress={() => void schedule.refetch()}><Text style={styles.action}>Повторить</Text></Pressable></View> : null}
    {schedule.data ? classScheduleDays.map(day => {
      const lessons = classScheduleLessons(schedule.data, day.key);
      return <View key={day.key} style={styles.day}>
        <Text accessibilityRole="header" style={styles.dayTitle}>{day.name}</Text>
        {!lessons.length ? <Text style={styles.empty}>Уроков нет</Text> : lessons.map(lesson => <View key={lesson.lesson_number} style={styles.lesson} accessible accessibilityLabel={`${lesson.lesson_number} урок. ${lesson.subject_display ?? 'Предмет не указан'}. ${lesson.teacher_display ?? 'Учитель не указан'}${lesson.room ? `. Кабинет ${lesson.room}` : ''}`}>
          <Text style={styles.number}>{lesson.lesson_number} урок</Text>
          <Text style={styles.subject}>{lesson.subject_display ?? 'Предмет не указан'}</Text>
          <Text style={styles.meta}>{lesson.teacher_display ?? 'Учитель не указан'}{lesson.room ? ` · Кабинет ${lesson.room}` : ''}</Text>
        </View>)}
      </View>;
    }) : null}
  </ScrollView></Screen>;
}

const styles = StyleSheet.create({ content: { paddingBottom: 30 }, backTarget: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }, back: { color: colors.primary, fontSize: 15, fontWeight: '700' }, title: { color: colors.ink, fontSize: 30, fontWeight: '800' }, subtitle: { color: colors.muted, fontSize: 17, marginTop: 5, marginBottom: 14 }, offline: { color: colors.danger, backgroundColor: colors.surface, borderRadius: 12, padding: 12, marginBottom: 8 }, day: { marginTop: 14 }, dayTitle: { color: colors.ink, fontSize: 20, fontWeight: '800', marginBottom: 8 }, card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 16 }, cardTitle: { color: colors.ink, fontSize: 20, fontWeight: '800' }, muted: { color: colors.muted, marginTop: 8 }, lesson: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 8 }, number: { color: colors.primary, fontWeight: '800', fontSize: 13 }, subject: { color: colors.ink, fontWeight: '800', fontSize: 17, marginTop: 4 }, meta: { color: colors.muted, marginTop: 5 }, empty: { color: colors.muted, backgroundColor: colors.surface, borderRadius: 14, padding: 14 }, error: { color: colors.danger }, retryTarget: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }, action: { color: colors.primary, fontWeight: '800' } });
