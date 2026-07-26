import { useNetInfo } from '@react-native-community/netinfo';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { bellSchedulesPath, bellTimeLabel, splitBellSchedule, type AdminBellSchedules } from '../../src/admin/bellSchedulesCore';
import { useAuth } from '../../src/auth/AuthProvider';
import { useCapabilities } from '../../src/auth/CapabilityProvider';
import { FeatureUnavailable } from '../../src/components/FeatureUnavailable';
import { Screen } from '../../src/components/Screen';
import { queryKeys } from '../../src/query/queryKeys';
import { colors } from '../../src/theme';

export default function BellSchedulesScreen() {
  const { account, apiClient } = useAuth();
  const { has } = useCapabilities();
  const network = useNetInfo();
  const eligible = Boolean(account && (account.user.role === 'school_admin' || account.user.role === 'director'));
  const schedules = useQuery({ queryKey: queryKeys.schoolAdminBellSchedules(account?.id ?? ''), enabled: Boolean(eligible && apiClient && has('school_admin_bell_schedules')), queryFn: () => apiClient!.get<AdminBellSchedules>(bellSchedulesPath()) });
  if (!has('school_admin_bell_schedules')) return <FeatureUnavailable />;
  if (!account || !apiClient || !eligible) return null;
  return <Screen><ScrollView contentContainerStyle={styles.content}>
    <Pressable onPress={() => router.back()}><Text style={styles.back}>Назад</Text></Pressable>
    <Text style={styles.title}>Расписание звонков</Text>
    <Text style={styles.subtitle}>Учебные смены и время уроков</Text>
    {network.isConnected === false ? <Text style={styles.offline}>{schedules.data ? 'Офлайн: показаны данные текущей сессии.' : 'Расписание звонков не хранится на устройстве.'}</Text> : null}
    {schedules.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
    {schedules.isError && !schedules.data ? <View style={styles.card}><Text style={styles.error}>Не удалось загрузить расписание.</Text><Pressable onPress={() => void schedules.refetch()}><Text style={styles.action}>Повторить</Text></Pressable></View> : null}
    {schedules.data && !schedules.data.data.length ? <Text style={styles.empty}>Расписание звонков пока не настроено.</Text> : null}
    {schedules.data?.data.map((schedule) => {
      const groups = splitBellSchedule(schedule.items);
      return <View key={schedule.id} style={styles.card}>
        <View style={styles.row}><Text style={styles.cardTitle}>{schedule.name}</Text><Text style={styles.count}>{schedule.classes_count} кл.</Text></View>
        {!schedule.items.length ? <Text style={styles.muted}>Звонки не настроены.</Text> : null}
        {groups.weekdays.length ? <View style={styles.group}><Text style={styles.groupTitle}>Понедельник–пятница</Text>{groups.weekdays.map((entry) => <View key={`weekday-${entry.lesson_number}`} style={styles.bell}><Text style={styles.lesson}>{entry.lesson_number} урок</Text><Text style={styles.time}>{bellTimeLabel(entry)}</Text></View>)}</View> : null}
        {groups.saturday.length ? <View style={styles.group}><Text style={styles.groupTitle}>Суббота</Text>{groups.saturday.map((entry) => <View key={`saturday-${entry.lesson_number}`} style={styles.bell}><Text style={styles.lesson}>{entry.lesson_number} урок</Text><Text style={styles.time}>{bellTimeLabel(entry)}</Text></View>)}</View> : null}
      </View>;
    })}
  </ScrollView></Screen>;
}

const styles = StyleSheet.create({ content: { paddingBottom: 30 }, back: { color: colors.primary, fontSize: 15, fontWeight: '700', marginBottom: 12 }, title: { color: colors.ink, fontSize: 30, fontWeight: '800' }, subtitle: { color: colors.muted, marginTop: 5, marginBottom: 14 }, offline: { color: colors.danger, backgroundColor: colors.surface, borderRadius: 12, padding: 12 }, card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 16, marginTop: 12 }, row: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 }, cardTitle: { color: colors.ink, fontSize: 18, fontWeight: '800', flex: 1 }, count: { color: colors.primary, fontWeight: '800' }, group: { borderTopColor: colors.border, borderTopWidth: 1, marginTop: 14, paddingTop: 12 }, groupTitle: { color: colors.muted, fontWeight: '700', marginBottom: 4 }, bell: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7 }, lesson: { color: colors.ink, fontWeight: '700' }, time: { color: colors.primary, fontWeight: '800' }, muted: { color: colors.muted, marginTop: 12 }, error: { color: colors.danger }, action: { color: colors.primary, fontWeight: '800', marginTop: 10 }, empty: { color: colors.muted, marginTop: 16 } });
