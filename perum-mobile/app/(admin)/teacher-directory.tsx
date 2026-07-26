import { useNetInfo } from '@react-native-community/netinfo';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { teacherAssignmentLabel, teacherDirectoryPath, type AdminTeacherDirectory } from '../../src/admin/teacherDirectoryCore';
import { useAuth } from '../../src/auth/AuthProvider';
import { useCapabilities } from '../../src/auth/CapabilityProvider';
import { FeatureUnavailable } from '../../src/components/FeatureUnavailable';
import { Screen } from '../../src/components/Screen';
import { queryKeys } from '../../src/query/queryKeys';
import { colors } from '../../src/theme';

export default function TeacherDirectoryScreen() {
  const { account, apiClient } = useAuth();
  const { has } = useCapabilities();
  const network = useNetInfo();
  const eligible = Boolean(account && (account.user.role === 'school_admin' || account.user.role === 'director'));
  const teachers = useQuery({ queryKey: queryKeys.schoolAdminTeacherDirectory(account?.id ?? ''), enabled: Boolean(eligible && apiClient && has('school_admin_teacher_directory')), queryFn: () => apiClient!.get<AdminTeacherDirectory>(teacherDirectoryPath()) });
  if (!has('school_admin_teacher_directory')) return <FeatureUnavailable />;
  if (!account || !apiClient || !eligible) return null;
  return <Screen><ScrollView contentContainerStyle={styles.content}>
    <Pressable onPress={() => router.back()}><Text style={styles.back}>Назад</Text></Pressable>
    <Text style={styles.title}>Учителя школы</Text>
    <Text style={styles.subtitle}>Активные учителя и их учебные назначения</Text>
    {network.isConnected === false ? <Text style={styles.offline}>{teachers.data ? 'Офлайн: показаны данные текущей сессии.' : 'Список учителей не хранится на устройстве.'}</Text> : null}
    {teachers.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
    {teachers.isError && !teachers.data ? <View style={styles.card}><Text style={styles.error}>Не удалось загрузить учителей.</Text><Pressable onPress={() => void teachers.refetch()}><Text style={styles.action}>Повторить</Text></Pressable></View> : null}
    {teachers.data && !teachers.data.teachers.length ? <Text style={styles.empty}>Активных учителей пока нет.</Text> : null}
    {teachers.data?.teachers.map((teacher) => <View key={teacher.id} style={styles.card}><View style={styles.row}><Text style={styles.cardTitle}>{teacher.name || `Учитель ${teacher.id}`}</Text><Text style={styles.count}>{teacherAssignmentLabel(teacher)}</Text></View>{teacher.assignments.map((assignment) => <View key={`${assignment.class.id}-${assignment.subject.id}`} style={styles.assignment}><Text style={styles.assignmentTitle}>{assignment.subject.name}</Text><Text style={styles.muted}>{assignment.class.name}</Text></View>)}</View>)}
  </ScrollView></Screen>;
}

const styles = StyleSheet.create({ content: { paddingBottom: 30 }, back: { color: colors.primary, fontSize: 15, fontWeight: '700', marginBottom: 12 }, title: { color: colors.ink, fontSize: 30, fontWeight: '800' }, subtitle: { color: colors.muted, marginTop: 5, marginBottom: 14 }, offline: { color: colors.danger, backgroundColor: colors.surface, borderRadius: 12, padding: 12 }, card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 16, marginTop: 12 }, row: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 }, cardTitle: { color: colors.ink, fontSize: 18, fontWeight: '800', flex: 1 }, count: { color: colors.primary, fontWeight: '800' }, assignment: { borderTopColor: colors.border, borderTopWidth: 1, marginTop: 12, paddingTop: 10 }, assignmentTitle: { color: colors.ink, fontWeight: '700' }, muted: { color: colors.muted, marginTop: 5 }, error: { color: colors.danger }, action: { color: colors.primary, fontWeight: '800', marginTop: 10 }, empty: { color: colors.muted, marginTop: 16 } });
