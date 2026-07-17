import { useQuery } from '@tanstack/react-query';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../src/auth/AuthProvider';
import { useHomeworkSync } from '../../src/homework/HomeworkProvider';
import type { Homework, HomeworkStatus } from '../../src/homework/types';
import { queryKeys } from '../../src/query/queryKeys';
import { colors } from '../../src/theme';
import { Screen } from '../../src/components/Screen';
import { useCapabilities } from '../../src/auth/CapabilityProvider';
import { FeatureUnavailable } from '../../src/components/FeatureUnavailable';

export default function HomeworkScreen() {
  const { account, apiClient } = useAuth();
  const { has } = useCapabilities();
  const enabled = has('offline_homework_state');
  const sync = useHomeworkSync();
  const query = useQuery({ queryKey: queryKeys.homework(account?.id ?? ''), enabled: Boolean(enabled && account && apiClient), queryFn: () => apiClient!.get<{ homework: Homework[] }>('/homework') });
  if (!enabled) return <FeatureUnavailable />;
  return <Screen>
    <Text style={styles.title}>Домашние задания</Text>
    {query.data?.homework.map(item => {
      const queued = [...sync.pending].reverse().find(value => value.homeworkId === item.id);
      const status = queued?.status ?? item.student_state.status;
      return <View key={item.id} style={styles.card}>
        <Text style={styles.subject}>{item.subject_name}</Text>
        <Text style={styles.name}>{item.title}</Text>
        {item.description ? <Text style={styles.body}>{item.description}</Text> : null}
        <Text style={styles.meta}>{item.deadline_at || item.due_date ? `Срок: ${new Date(item.deadline_at ?? item.due_date!).toLocaleString()}` : 'Без срока'}{queued && queued.state !== 'conflict' ? ' · ожидает синхронизации' : ''}</Text>
        {queued?.state === 'conflict' && queued.serverState ? <View style={styles.conflict}>
          <Text style={styles.body}>Задание изменено на другом устройстве. На сервере: {queued.serverState.status}.</Text>
          <Pressable onPress={() => void sync.resolve(queued.id, 'server')}><Text style={styles.action}>Принять серверное</Text></Pressable>
          <Pressable onPress={() => void sync.resolve(queued.id, 'local')}><Text style={styles.action}>Повторить моё изменение</Text></Pressable>
        </View> : null}
        <View style={styles.actions}>{([['not_started', 'Не начато'], ['in_progress', 'В процессе'], ['completed', 'Готово']] as [HomeworkStatus, string][]).map(([value, label]) => <Pressable key={value} disabled={status === value || queued?.state === 'conflict'} onPress={() => void sync.enqueue(item.id, item.student_state.version, value)}><Text style={[styles.action, status === value && styles.active]}>{label}</Text></Pressable>)}</View>
      </View>;
    })}
    {query.isLoading ? <Text>Загрузка…</Text> : null}
  </Screen>;
}
const styles = StyleSheet.create({ title: { fontSize: 30, fontWeight: '800', color: colors.ink, marginBottom: 20 }, card: { padding: 18, borderWidth: 1, borderColor: colors.border, borderRadius: 18, marginBottom: 12, backgroundColor: colors.surface }, subject: { color: colors.primary, fontWeight: '700' }, name: { color: colors.ink, fontSize: 19, fontWeight: '700', marginTop: 6 }, body: { color: colors.muted, marginTop: 6 }, meta: { color: colors.muted, marginTop: 10, fontSize: 12 }, actions: { flexDirection: 'row', gap: 10, marginTop: 14, flexWrap: 'wrap' }, action: { color: colors.primary, fontWeight: '700', padding: 6 }, active: { color: colors.ink }, conflict: { marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: '#fff3cd' } });
