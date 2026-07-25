import { useNetInfo } from '@react-native-community/netinfo';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { canViewSchoolAdminOverview, schoolAdminOverviewPath, schoolAdminOverviewPeriods, type SchoolAdminOverview, type SchoolAdminOverviewPeriod } from '../../src/admin/overviewCore';
import { useAuth } from '../../src/auth/AuthProvider';
import { useCapabilities } from '../../src/auth/CapabilityProvider';
import { FeatureUnavailable } from '../../src/components/FeatureUnavailable';
import { Screen } from '../../src/components/Screen';
import { queryKeys } from '../../src/query/queryKeys';
import { colors } from '../../src/theme';

const periodLabels: Record<SchoolAdminOverviewPeriod, string> = { 7: '7 дней', 30: '30 дней', 90: '90 дней', 365: 'Год' };

export default function SchoolAdminOverviewScreen() {
  const { account, apiClient } = useAuth();
  const { has } = useCapabilities();
  const network = useNetInfo();
  const [periodDays, setPeriodDays] = useState<SchoolAdminOverviewPeriod>(30);
  const eligible = Boolean(account && canViewSchoolAdminOverview(account.user.role));
  const overview = useQuery({ queryKey: queryKeys.schoolAdminOverview(account?.id ?? '', periodDays), enabled: Boolean(eligible && apiClient && has('school_admin_overview')), queryFn: () => apiClient!.get<SchoolAdminOverview>(schoolAdminOverviewPath(periodDays)), placeholderData: keepPreviousData });
  if (!has('school_admin_overview')) return <FeatureUnavailable />;
  if (!account || !apiClient || !canViewSchoolAdminOverview(account.user.role)) return null;
  const data = overview.data;
  return <Screen><ScrollView contentContainerStyle={styles.content}>
    <Pressable onPress={() => router.back()}><Text style={styles.back}>Назад</Text></Pressable>
    <Text style={styles.title}>Обзор школы</Text>
    <Text style={styles.subtitle}>Успеваемость и активность за выбранный период</Text>
    <View style={styles.selector}>{schoolAdminOverviewPeriods.map((period) => <Pressable key={period} accessibilityRole="radio" accessibilityState={{ checked: period === periodDays }} style={[styles.chip, period === periodDays && styles.chipActive]} onPress={() => setPeriodDays(period)}><Text style={[styles.chipText, period === periodDays && styles.chipTextActive]}>{periodLabels[period]}</Text></Pressable>)}</View>
    {network.isConnected === false ? <Text style={styles.offline}>{data ? 'Офлайн: показаны данные текущей сессии.' : 'Нет подключения. Сохранённый обзор школы не хранится на устройстве.'}</Text> : null}
    {overview.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
    {overview.isError && !data ? <View style={styles.card}><Text style={styles.error}>Не удалось загрузить обзор.</Text><Pressable onPress={() => void overview.refetch()}><Text style={styles.action}>Повторить</Text></Pressable></View> : null}
    {data ? <><View style={styles.stats}><Stat label="Средний балл" value={data.kpi.average_grade} /><Stat label="Оценок" value={data.kpi.total_grades} /><Stat label="Учеников" value={data.kpi.total_students} /><Stat label="Отстающих" value={data.kpi.failing_count} /><Stat label="Пропусков" value={data.kpi.absences} /><Stat label="ДЗ / контрольных" value={`${data.kpi.homework_count} / ${data.kpi.control_work_count}`} /></View><Section title="Средний балл по дням" empty={!data.daily_avg.length}>{data.daily_avg.map((item) => <Row key={item.date} title={item.date} value={String(item.avg_grade)} />)}</Section><Section title="Успеваемость классов" empty={!data.class_performance.length}>{data.class_performance.map((item) => <Row key={item.class_id} title={item.class_name} value={`${item.avg_grade} · ${item.grades_count} оценок`} />)}</Section><Section title="Распределение оценок" empty={!data.grade_distribution.length}>{data.grade_distribution.map((item) => <Row key={item.grade_value} title={`Оценка ${item.grade_value}`} value={String(item.count)} />)}</Section><Section title="Посещаемость" empty={!data.attendance.length}>{data.attendance.map((item) => <Row key={item.mark} title={item.mark} value={String(item.count)} />)}</Section><Section title="Активность учителей" empty={!data.teacher_activity.length}>{data.teacher_activity.map((item) => <Row key={item.id} title={item.name || `Учитель ${item.id}`} value={`${item.grades_given} оценок`} />)}</Section><Section title="Требуют внимания" empty={!data.failing_students.length}>{data.failing_students.map((item) => <Row key={item.id} title={item.name || `Ученик ${item.id}`} value={`${item.class_name ?? 'Класс не указан'} · ${item.avg}`} />)}</Section></> : null}
  </ScrollView></Screen>;
}

function Stat({ label, value }: { label: string; value: number | string }) { return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.muted}>{label}</Text></View>; }
function Section({ title, empty, children }: { title: string; empty: boolean; children: React.ReactNode }) { return <View style={styles.card}><Text style={styles.cardTitle}>{title}</Text>{empty ? <Text style={styles.muted}>Данных пока нет.</Text> : children}</View>; }
function Row({ title, value }: { title: string; value: string }) { return <View style={styles.row}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.rowValue}>{value}</Text></View>; }

const styles = StyleSheet.create({
  content: { paddingBottom: 30 }, back: { color: colors.primary, fontSize: 15, fontWeight: '700', marginBottom: 12 }, title: { color: colors.ink, fontSize: 30, fontWeight: '800' }, subtitle: { color: colors.muted, marginTop: 5, marginBottom: 14 }, selector: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { borderColor: colors.border, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: colors.surface }, chipActive: { backgroundColor: colors.primary, borderColor: colors.primary }, chipText: { color: colors.ink, fontWeight: '700' }, chipTextActive: { color: colors.white }, offline: { color: colors.danger, backgroundColor: colors.surface, borderRadius: 12, padding: 12, marginTop: 12 }, stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 }, stat: { width: '47%', backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 14 }, statValue: { color: colors.primary, fontSize: 22, fontWeight: '800' }, card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 16, marginTop: 12 }, cardTitle: { color: colors.ink, fontSize: 18, fontWeight: '800', marginBottom: 8 }, row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, borderTopColor: colors.border, borderTopWidth: 1, paddingVertical: 10 }, rowTitle: { color: colors.ink, flex: 1, fontWeight: '700' }, rowValue: { color: colors.primary, fontWeight: '800', textAlign: 'right' }, muted: { color: colors.muted, marginTop: 4 }, error: { color: colors.danger }, action: { color: colors.primary, fontWeight: '800', marginTop: 10 },
});
