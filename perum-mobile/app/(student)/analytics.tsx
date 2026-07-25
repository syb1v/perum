import { useNetInfo } from '@react-native-community/netinfo';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { studentAnalyticsPath, studentPeriodGrade, studentSummaryPath, type StudentGradesAnalytics, type StudentGradesSummary } from '../../src/academics/studentAnalyticsCore';
import { useAuth } from '../../src/auth/AuthProvider';
import { useCapabilities } from '../../src/auth/CapabilityProvider';
import { FeatureUnavailable } from '../../src/components/FeatureUnavailable';
import { Screen } from '../../src/components/Screen';
import { queryKeys } from '../../src/query/queryKeys';
import { colors } from '../../src/theme';

export default function StudentAnalyticsScreen() {
  const { account, apiClient } = useAuth();
  const { has } = useCapabilities();
  const network = useNetInfo();
  const enabled = Boolean(account && apiClient && account.user.role === 'student' && has('student_analytics'));
  const summary = useQuery({ queryKey: queryKeys.studentSummary(account?.id ?? ''), enabled, queryFn: () => apiClient!.get<StudentGradesSummary>(studentSummaryPath()) });
  const analytics = useQuery({ queryKey: queryKeys.studentAnalytics(account?.id ?? ''), enabled, queryFn: () => apiClient!.get<StudentGradesAnalytics>(studentAnalyticsPath()) });
  if (!has('student_analytics')) return <FeatureUnavailable />;
  if (!account || !apiClient || account.user.role !== 'student') return null;
  return <Screen><ScrollView contentContainerStyle={styles.content}>
    <Pressable onPress={() => router.back()}><Text style={styles.back}>Назад</Text></Pressable>
    <Text style={styles.title}>Аналитика оценок</Text>
    <Text style={styles.subtitle}>Средние баллы и динамика по учебным периодам</Text>
    {network.isConnected === false ? <Text style={styles.offline}>Офлайн: показаны последние сохранённые данные.</Text> : null}
    {summary.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
    {summary.isError && !summary.data ? <ErrorCard text="Не удалось загрузить сводку." retry={() => void summary.refetch()} /> : null}
    {summary.data ? <><View style={styles.stats}><Stat label="Оценок" value={summary.data.total_grades} /><Stat label="Баллов за оценки" value={summary.data.total_points} /></View><Section title="Средние по предметам" empty={!summary.data.subjects.length}>{summary.data.subjects.map((item) => <Row key={item.subject_id} title={item.subject_name} value={`${item.average} · ${item.count} оценок · ${item.points} баллов`} />)}</Section></> : null}
    {analytics.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
    {analytics.isError && !analytics.data ? <ErrorCard text="Не удалось загрузить динамику." retry={() => void analytics.refetch()} /> : null}
    {analytics.data ? <Section title="Динамика по периодам" empty={!analytics.data.subjects.length}>{analytics.data.subjects.map((subject) => <View key={subject.subject_id} style={styles.subjectBlock}><Text style={styles.rowTitle}>{subject.subject_name} · год: {subject.year_average}</Text>{analytics.data.periods.map((period) => <Row key={period.id} title={period.name} value={studentPeriodGrade(subject.periods, period.id)?.toString() ?? '—'} />)}</View>)}</Section> : null}
  </ScrollView></Screen>;
}

function Stat({ label, value }: { label: string; value: number }) { return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.muted}>{label}</Text></View>; }
function Section({ title, empty, children }: { title: string; empty: boolean; children: React.ReactNode }) { return <View style={styles.card}><Text style={styles.cardTitle}>{title}</Text>{empty ? <Text style={styles.muted}>Данных пока нет.</Text> : children}</View>; }
function Row({ title, value }: { title: string; value: string }) { return <View style={styles.row}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.rowValue}>{value}</Text></View>; }
function ErrorCard({ text, retry }: { text: string; retry: () => void }) { return <View style={styles.card}><Text style={styles.error}>{text}</Text><Pressable onPress={retry}><Text style={styles.action}>Повторить</Text></Pressable></View>; }

const styles = StyleSheet.create({
  content: { paddingBottom: 30 }, back: { color: colors.primary, fontSize: 15, fontWeight: '700', marginBottom: 12 }, title: { color: colors.ink, fontSize: 30, fontWeight: '800' }, subtitle: { color: colors.muted, marginTop: 5, marginBottom: 14 }, offline: { color: colors.danger, backgroundColor: colors.surface, borderRadius: 12, padding: 12 }, stats: { flexDirection: 'row', gap: 10, marginTop: 16 }, stat: { flex: 1, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 14 }, statValue: { color: colors.primary, fontSize: 22, fontWeight: '800' }, card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 16, marginTop: 12 }, cardTitle: { color: colors.ink, fontSize: 18, fontWeight: '800', marginBottom: 8 }, row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, borderTopColor: colors.border, borderTopWidth: 1, paddingVertical: 10 }, rowTitle: { color: colors.ink, flex: 1, fontWeight: '700' }, rowValue: { color: colors.primary, fontWeight: '800', textAlign: 'right' }, subjectBlock: { marginTop: 8 }, muted: { color: colors.muted, marginTop: 4 }, error: { color: colors.danger }, action: { color: colors.primary, fontWeight: '800', marginTop: 10 },
});
