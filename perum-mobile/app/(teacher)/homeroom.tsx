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

type Homeroom = components['schemas']['TeacherHomeroomOut'];

export default function TeacherHomeroomScreen() {
  const { account, apiClient } = useAuth();
  const { has } = useCapabilities();
  const network = useNetInfo();
  const enabled = Boolean(account && apiClient && account.user.role === 'teacher' && has('teacher_homeroom'));
  const homeroom = useQuery({ queryKey: queryKeys.teacherHomeroom(account?.id ?? ''), enabled, queryFn: () => apiClient!.get<Homeroom>('/teacher/my-class') });
  if (!has('teacher_homeroom')) return <FeatureUnavailable />;
  if (!account || !apiClient || account.user.role !== 'teacher') return null;
  return <Screen>
    <Pressable onPress={() => router.back()}><Text style={styles.back}>Назад</Text></Pressable>
    <Text style={styles.title}>Мой класс</Text>
    {network.isConnected === false ? <Text style={styles.offline}>Офлайн: показаны последние сохранённые данные.</Text> : null}
    {homeroom.isLoading ? <Text style={styles.muted}>Загрузка…</Text> : null}
    {homeroom.isError && !homeroom.data ? <View style={styles.card}><Text style={styles.error}>Не удалось загрузить класс.</Text><Pressable onPress={() => void homeroom.refetch()}><Text style={styles.action}>Повторить</Text></Pressable></View> : null}
    {homeroom.data && !homeroom.data.has_class ? <View style={styles.card}><Text style={styles.cardTitle}>Класс не назначен</Text><Text style={styles.muted}>Обратитесь к администрации школы.</Text></View> : null}
    {homeroom.data?.has_class ? <><View style={styles.card}><Text style={styles.cardTitle}>{homeroom.data.class?.name ?? 'Класс'}</Text><View style={styles.stats}><Stat label="Учеников" value={homeroom.data.stats.student_count} /><Stat label="Средний балл" value={homeroom.data.stats.avg_grade} /><Stat label="Оценок" value={homeroom.data.stats.total_grades} /></View></View><View style={styles.card}><Text style={styles.cardTitle}>Ученики</Text>{homeroom.data.students.length ? homeroom.data.students.map(student => <View key={student.id} style={styles.row}><View><Text style={styles.name}>{[student.last_name, student.first_name, student.patronymic].filter(Boolean).join(' ') || student.login}</Text><Text style={styles.muted}>Баланс: {student.balance}</Text></View></View>) : <Text style={styles.muted}>В классе пока нет учеников.</Text>}</View></> : null}
  </Screen>;
}

function Stat({ label, value }: { label: string; value: number }) { return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.muted}>{label}</Text></View>; }

const styles = StyleSheet.create({
  back: { color: colors.primary, fontSize: 15, fontWeight: '700', marginBottom: 12 }, title: { color: colors.ink, fontSize: 30, fontWeight: '800', marginBottom: 14 }, offline: { color: colors.danger, backgroundColor: colors.surface, borderRadius: 12, padding: 12 }, card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 16, marginTop: 12 }, cardTitle: { color: colors.ink, fontSize: 18, fontWeight: '800' }, stats: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 }, stat: { flex: 1 }, statValue: { color: colors.primary, fontSize: 21, fontWeight: '800' }, row: { borderTopColor: colors.border, borderTopWidth: 1, paddingVertical: 11 }, name: { color: colors.ink, fontWeight: '700' }, muted: { color: colors.muted, marginTop: 4 }, error: { color: colors.danger }, action: { color: colors.primary, fontWeight: '800', marginTop: 10 },
});
