import { useNetInfo } from '@react-native-community/netinfo';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../src/auth/AuthProvider';
import { useCapabilities } from '../../src/auth/CapabilityProvider';
import { FeatureUnavailable } from '../../src/components/FeatureUnavailable';
import { Screen } from '../../src/components/Screen';
import { calendarPeriodsPath, calendarYearsPath, formatCalendarDate, groupPeriodsByYear, type AcademicYears, type SchoolPeriods } from '../../src/admin/academicCalendarCore';
import { queryKeys } from '../../src/query/queryKeys';
import { colors } from '../../src/theme';

export default function AcademicCalendarScreen() {
  const { account, apiClient } = useAuth();
  const { has } = useCapabilities();
  const network = useNetInfo();
  const eligible = Boolean(account && (account.user.role === 'school_admin' || account.user.role === 'director'));
  const enabled = Boolean(eligible && apiClient && has('school_admin_academic_calendar'));
  const calendar = useQuery({ queryKey: queryKeys.schoolAdminAcademicCalendar(account?.id ?? ''), enabled, queryFn: async () => { const [years, periods] = await Promise.all([apiClient!.get<AcademicYears>(calendarYearsPath()), apiClient!.get<SchoolPeriods>(calendarPeriodsPath())]); return { years, periods }; } });
  if (!has('school_admin_academic_calendar')) return <FeatureUnavailable />;
  if (!account || !apiClient || !eligible) return null;
  const groups = calendar.data ? groupPeriodsByYear(calendar.data.years.academic_years, calendar.data.periods.periods) : [];
  return <Screen><ScrollView contentContainerStyle={styles.content}>
    <Pressable onPress={() => router.back()}><Text style={styles.back}>Назад</Text></Pressable>
    <Text style={styles.title}>Учебный календарь</Text>
    <Text style={styles.subtitle}>Учебные годы и периоды школы</Text>
    {network.isConnected === false ? <Text style={styles.offline}>{calendar.data ? 'Офлайн: показаны данные текущей сессии.' : 'Календарь не хранится на устройстве.'}</Text> : null}
    {calendar.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
    {calendar.isError && !calendar.data ? <View style={styles.card}><Text style={styles.error}>Не удалось загрузить календарь.</Text><Pressable onPress={() => void calendar.refetch()}><Text style={styles.action}>Повторить</Text></Pressable></View> : null}
    {calendar.data && !groups.length ? <Text style={styles.empty}>Учебных годов пока нет.</Text> : null}
    {groups.map(({ year, periods }) => <View key={year.id} style={styles.card}><View style={styles.yearRow}><Text style={styles.cardTitle}>{year.name}</Text>{year.is_current ? <Text style={styles.current}>Текущий</Text> : null}</View><Text style={styles.muted}>{formatCalendarDate(year.start_date)} – {formatCalendarDate(year.end_date)}</Text>{periods.length ? periods.map((period) => <View key={period.id} style={styles.period}><View style={styles.yearRow}><Text style={styles.periodTitle}>{period.name}</Text><Text style={period.is_active ? styles.active : styles.inactive}>{period.is_active ? 'Активен' : 'Неактивен'}</Text></View><Text style={styles.muted}>{period.period_type} · {formatCalendarDate(period.start_date)} – {formatCalendarDate(period.end_date)}</Text>{period.target_grades?.length ? <Text style={styles.muted}>Классы: {period.target_grades.join(', ')}</Text> : null}</View>) : <Text style={styles.muted}>Периодов нет.</Text>}</View>)}
  </ScrollView></Screen>;
}

const styles = StyleSheet.create({ content: { paddingBottom: 30 }, back: { color: colors.primary, fontSize: 15, fontWeight: '700', marginBottom: 12 }, title: { color: colors.ink, fontSize: 30, fontWeight: '800' }, subtitle: { color: colors.muted, marginTop: 5, marginBottom: 14 }, offline: { color: colors.danger, backgroundColor: colors.surface, borderRadius: 12, padding: 12 }, card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 16, marginTop: 12 }, yearRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 }, cardTitle: { color: colors.ink, fontSize: 19, fontWeight: '800' }, periodTitle: { color: colors.ink, fontWeight: '700' }, current: { color: colors.primary, fontWeight: '800' }, active: { color: colors.primary, fontWeight: '700' }, inactive: { color: colors.muted, fontWeight: '700' }, period: { borderTopColor: colors.border, borderTopWidth: 1, marginTop: 12, paddingTop: 12 }, muted: { color: colors.muted, marginTop: 5 }, error: { color: colors.danger }, action: { color: colors.primary, fontWeight: '800', marginTop: 10 }, empty: { color: colors.muted, marginTop: 16 } });
