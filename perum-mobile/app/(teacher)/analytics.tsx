import { useNetInfo } from '@react-native-community/netinfo';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../src/auth/AuthProvider';
import { useCapabilities } from '../../src/auth/CapabilityProvider';
import { FeatureUnavailable } from '../../src/components/FeatureUnavailable';
import { Screen } from '../../src/components/Screen';
import { queryKeys } from '../../src/query/queryKeys';
import { colors } from '../../src/theme';
import { academicPeriods, formatAnalyticsDate, selectTeacherClass, selectTeacherPeriod, selectTeacherSubject, sortedTeacherClasses, teacherAnalyticsPath, teacherPeriodsPath, type TeacherAnalyticsDashboard, type TeacherAnalyticsPeriods, type TeacherAnalyticsPicker } from '../../src/teacher/analyticsCore';

export default function TeacherAnalyticsScreen() {
  const { account, apiClient } = useAuth();
  const { has } = useCapabilities();
  const network = useNetInfo();
  const [classId, setClassId] = useState<number | null>(null);
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [periodId, setPeriodId] = useState<number | null>(null);
  const enabled = Boolean(account && apiClient && account.user.role === 'teacher' && has('teacher_analytics'));
  const picker = useQuery({ queryKey: queryKeys.teacherAnalyticsPicker(account?.id ?? ''), enabled, queryFn: () => apiClient!.get<TeacherAnalyticsPicker>('/journal/teacher/subjects') });
  const classes = sortedTeacherClasses(picker.data);
  const selectedClass = classes.find((item) => item.id === classId);
  useEffect(() => { setClassId((current) => selectTeacherClass(classes, current)); }, [classes.map((item) => item.id).join(',')]);
  useEffect(() => { setSubjectId((current) => selectTeacherSubject(selectedClass, current)); setPeriodId(null); }, [classId]);
  const periods = useQuery({ queryKey: queryKeys.teacherAnalyticsPeriods(account?.id ?? '', classId ?? 0), enabled: enabled && classId !== null, queryFn: () => apiClient!.get<TeacherAnalyticsPeriods>(teacherPeriodsPath(classId!)) });
  const availablePeriods = academicPeriods(periods.data);
  useEffect(() => { setPeriodId((current) => selectTeacherPeriod(periods.data, current)); }, [classId, periods.data]);
  const selectedPeriod = availablePeriods.find((item) => item.id === periodId);
  const dashboard = useQuery({ queryKey: queryKeys.teacherAnalyticsDashboard(account?.id ?? '', classId ?? 0, subjectId, selectedPeriod?.start_date ?? '', selectedPeriod?.end_date ?? ''), enabled: enabled && classId !== null && Boolean(selectedPeriod), queryFn: () => apiClient!.get<TeacherAnalyticsDashboard>(teacherAnalyticsPath(classId!, selectedPeriod!, subjectId)) });
  if (!has('teacher_analytics')) return <FeatureUnavailable />;
  if (!account || !apiClient || account.user.role !== 'teacher') return null;
  return <Screen><ScrollView contentContainerStyle={styles.content}>
    <Pressable onPress={() => router.back()}><Text style={styles.back}>Назад</Text></Pressable>
    <Text style={styles.title}>Аналитика класса</Text>
    <Text style={styles.subtitle}>Сводка успеваемости по классу, предмету и периоду</Text>
    {network.isConnected === false ? <Text style={styles.offline}>Офлайн: показаны последние сохранённые данные.</Text> : null}
    {picker.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
    {picker.isError && !picker.data ? <ErrorCard text="Не удалось загрузить классы." retry={() => void picker.refetch()} /> : null}
    {picker.data && !classes.length ? <Text style={styles.empty}>У вас нет доступных классов.</Text> : null}
    {classes.length ? <Selector title="Класс" items={classes.map((item) => ({ id: item.id, label: item.name }))} selected={classId} onSelect={setClassId} /> : null}
    {selectedClass ? <Selector title="Предмет" items={[{ id: null, label: 'Все предметы' }, ...selectedClass.subjects.map((item) => ({ id: item.id, label: item.short_name ?? item.name }))]} selected={subjectId} onSelect={setSubjectId} /> : null}
    {periods.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
    {periods.isError && !periods.data ? <ErrorCard text="Не удалось загрузить периоды." retry={() => void periods.refetch()} /> : null}
    {periods.data && !availablePeriods.length ? <Text style={styles.empty}>Для класса нет учебных периодов.</Text> : null}
    {availablePeriods.length ? <Selector title="Период" items={availablePeriods.map((item) => ({ id: item.id, label: item.name }))} selected={periodId} onSelect={setPeriodId} /> : null}
    {dashboard.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
    {dashboard.isError && !dashboard.data ? <ErrorCard text="Не удалось загрузить аналитику." retry={() => void dashboard.refetch()} /> : null}
    {dashboard.data ? <Dashboard data={dashboard.data} /> : null}
  </ScrollView></Screen>;
}

function Selector({ title, items, selected, onSelect }: { title: string; items: { id: number | null; label: string }[]; selected: number | null; onSelect: (value: number | null) => void }) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text><View style={styles.chips}>{items.map((item) => <Pressable key={`${title}-${item.id ?? 'all'}`} accessibilityRole="radio" accessibilityState={{ checked: selected === item.id }} style={[styles.chip, selected === item.id && styles.chipActive]} onPress={() => onSelect(item.id)}><Text style={[styles.chipText, selected === item.id && styles.chipTextActive]}>{item.label}</Text></Pressable>)}</View></View>;
}

function Dashboard({ data }: { data: TeacherAnalyticsDashboard }) {
  return <><View style={styles.stats}><Stat label="Средний балл" value={data.kpi.avg_grade} /><Stat label="Оценок" value={data.kpi.total_grades} /><Stat label="Низких" value={data.kpi.bad_grades} /><Stat label="Доля низких" value={data.kpi.bad_ratio} /></View><Section title="Динамика успеваемости" empty={!data.dynamics.length}>{data.dynamics.map((item) => <Row key={item.date} title={formatAnalyticsDate(item.date)} value={String(item.avg)} />)}</Section><Section title="Проблемные темы" empty={!data.problem_topics.length}>{data.problem_topics.map((item) => <Row key={item.id} title={item.name} value={`${item.avg} · ${item.bad_ratio}`} />)}</Section><Section title="Требуют внимания" empty={!data.attention_students.length}>{data.attention_students.map((item) => <Row key={item.id} title={item.name} value={`${item.avg} · двоек: ${item.twos}`} />)}</Section></>;
}

function Stat({ label, value }: { label: string; value: number | string }) { return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.muted}>{label}</Text></View>; }
function Section({ title, empty, children }: { title: string; empty: boolean; children: React.ReactNode }) { return <View style={styles.card}><Text style={styles.cardTitle}>{title}</Text>{empty ? <Text style={styles.muted}>Данных пока нет.</Text> : children}</View>; }
function Row({ title, value }: { title: string; value: string }) { return <View style={styles.row}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.rowValue}>{value}</Text></View>; }
function ErrorCard({ text, retry }: { text: string; retry: () => void }) { return <View style={styles.card}><Text style={styles.error}>{text}</Text><Pressable onPress={retry}><Text style={styles.action}>Повторить</Text></Pressable></View>; }

const styles = StyleSheet.create({
  content: { paddingBottom: 30 }, back: { color: colors.primary, fontSize: 15, fontWeight: '700', marginBottom: 12 }, title: { color: colors.ink, fontSize: 30, fontWeight: '800' }, subtitle: { color: colors.muted, marginTop: 5, marginBottom: 14 }, offline: { color: colors.danger, backgroundColor: colors.surface, borderRadius: 12, padding: 12, marginBottom: 10 }, section: { marginTop: 14 }, sectionTitle: { color: colors.ink, fontSize: 16, fontWeight: '800', marginBottom: 8 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { borderColor: colors.border, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: colors.surface }, chipActive: { backgroundColor: colors.primary, borderColor: colors.primary }, chipText: { color: colors.ink, fontWeight: '700' }, chipTextActive: { color: colors.white }, stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 18 }, stat: { width: '47%', backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 14 }, statValue: { color: colors.primary, fontSize: 22, fontWeight: '800' }, card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 16, marginTop: 12 }, cardTitle: { color: colors.ink, fontSize: 18, fontWeight: '800' }, row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, borderTopColor: colors.border, borderTopWidth: 1, paddingVertical: 11 }, rowTitle: { color: colors.ink, flex: 1, fontWeight: '700' }, rowValue: { color: colors.primary, fontWeight: '800' }, muted: { color: colors.muted, marginTop: 4 }, empty: { color: colors.muted, marginTop: 14 }, error: { color: colors.danger }, action: { color: colors.primary, fontWeight: '800', marginTop: 10 },
});
