import { useNetInfo } from '@react-native-community/netinfo';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { classDirectoryPath, classGradeLabel, classProfileLabel, classTeacherLabel, type AdminClasses } from '../../src/admin/classDirectoryCore';
import { useAuth } from '../../src/auth/AuthProvider';
import { useCapabilities } from '../../src/auth/CapabilityProvider';
import { FeatureUnavailable } from '../../src/components/FeatureUnavailable';
import { Screen } from '../../src/components/Screen';
import { queryKeys } from '../../src/query/queryKeys';
import { colors } from '../../src/theme';

export default function ClassDirectoryScreen() {
  const { account, apiClient } = useAuth();
  const { has } = useCapabilities();
  const network = useNetInfo();
  const eligible = Boolean(account && (account.user.role === 'school_admin' || account.user.role === 'director'));
  const classes = useQuery({ queryKey: queryKeys.schoolAdminClassDirectory(account?.id ?? ''), enabled: Boolean(eligible && apiClient && has('school_admin_class_directory')), queryFn: () => apiClient!.get<AdminClasses>(classDirectoryPath()) });
  if (!has('school_admin_class_directory')) return <FeatureUnavailable />;
  if (!account || !apiClient || !eligible) return null;
  return <Screen><ScrollView contentContainerStyle={styles.content}>
    <Pressable onPress={() => router.back()}><Text style={styles.back}>Назад</Text></Pressable>
    <Text style={styles.title}>Классы школы</Text>
    <Text style={styles.subtitle}>Состав и назначение классов</Text>
    {network.isConnected === false ? <Text style={styles.offline}>{classes.data ? 'Офлайн: показаны данные текущей сессии.' : 'Список классов не хранится на устройстве.'}</Text> : null}
    {classes.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
    {classes.isError && !classes.data ? <View style={styles.card}><Text style={styles.error}>Не удалось загрузить классы.</Text><Pressable onPress={() => void classes.refetch()}><Text style={styles.action}>Повторить</Text></Pressable></View> : null}
    {classes.data && !classes.data.classes.length ? <Text style={styles.empty}>Классов пока нет.</Text> : null}
    {classes.data?.classes.map((item) => <View key={item.id} style={styles.card}><View style={styles.row}><Text style={styles.cardTitle}>{item.name}</Text>{classProfileLabel(item) ? <Text style={styles.profile}>{classProfileLabel(item)}</Text> : null}</View><Text style={styles.muted}>{classGradeLabel(item)}</Text><Text style={styles.muted}>Классный руководитель: {classTeacherLabel(item)}</Text><Text style={styles.count}>Учеников: {item.student_count}</Text></View>)}
  </ScrollView></Screen>;
}

const styles = StyleSheet.create({ content: { paddingBottom: 30 }, back: { color: colors.primary, fontSize: 15, fontWeight: '700', marginBottom: 12 }, title: { color: colors.ink, fontSize: 30, fontWeight: '800' }, subtitle: { color: colors.muted, marginTop: 5, marginBottom: 14 }, offline: { color: colors.danger, backgroundColor: colors.surface, borderRadius: 12, padding: 12 }, card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 16, marginTop: 12 }, row: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 }, cardTitle: { color: colors.ink, fontSize: 19, fontWeight: '800' }, profile: { color: colors.primary, fontWeight: '800' }, muted: { color: colors.muted, marginTop: 6 }, count: { color: colors.ink, fontWeight: '800', marginTop: 12 }, error: { color: colors.danger }, action: { color: colors.primary, fontWeight: '800', marginTop: 10 }, empty: { color: colors.muted, marginTop: 16 } });
