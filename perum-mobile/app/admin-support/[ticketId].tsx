import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useNetInfo } from '@react-native-community/netinfo';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../../src/auth/AuthProvider';
import { useCapabilities } from '../../src/auth/CapabilityProvider';
import { FeatureUnavailable } from '../../src/components/FeatureUnavailable';
import { Screen } from '../../src/components/Screen';
import { queryKeys } from '../../src/query/queryKeys';
import { adminMessageLabel, canQueueAdminReply, canUseAdminSupport, escalationDeliveryLabel, type AdminTicketAction } from '../../src/support/adminCore';
import { useAdminActionSync } from '../../src/support/AdminActionProvider';
import type { AdminSupportAssignee, AdminSupportEscalationDelivery, SupportMessagePage, SupportTicket } from '../../src/support/types';
import { colors } from '../../src/theme';

const statuses = [['open', 'Открыто'], ['in_progress', 'В работе'], ['waiting_requester', 'Ждёт пользователя'], ['resolved', 'Решено'], ['closed', 'Закрыто']] as const;
const categories = [['general', 'Общее'], ['technical', 'Техническое'], ['account', 'Аккаунт'], ['academic', 'Учебное'], ['safety', 'Безопасность'], ['other', 'Другое']] as const;
const priorities = [['low', 'Низкий'], ['normal', 'Обычный'], ['high', 'Высокий'], ['urgent', 'Срочный']] as const;
type DisplayMessage = SupportMessagePage['items'][number] & { localId?: string; delivery?: 'pending' | 'failed' };

export default function AdminSupportThreadScreen() {
  const { ticketId = '' } = useLocalSearchParams<{ ticketId: string }>();
  const { account, apiClient } = useAuth();
  const { has } = useCapabilities();
  const network = useNetInfo();
  const [reply, setReply] = useState('');
  const { pending: pendingActions, pendingReplies, pendingReads, enqueue: enqueueAction, enqueueReply, markRead, retryReply, retryRead, discard: discardAction } = useAdminActionSync();
  const enabled = has('support_admin');
  const eligible = canUseAdminSupport(account?.user.role, enabled);
  const pendingAction = pendingActions.find(item => item.ticketId === ticketId);
  const pendingRead = pendingReads.find(item => item.ticketId === ticketId);
  const detail = useQuery({ queryKey: queryKeys.adminSupportTicket(account?.id ?? '', ticketId), enabled: Boolean(account && apiClient && eligible && ticketId), queryFn: () => apiClient!.get<SupportTicket>(`/admin/support/tickets/${ticketId}`), refetchInterval: 10_000 });
  const assignees = useQuery({ queryKey: queryKeys.adminSupportAssignees(account?.id ?? ''), enabled: Boolean(account && apiClient && eligible), queryFn: () => apiClient!.get<AdminSupportAssignee[]>('/admin/support/assignees') });
  const delivery = useQuery({ queryKey: queryKeys.adminSupportEscalationDelivery(account?.id ?? '', ticketId), enabled: Boolean(account && apiClient && eligible && detail.data?.escalation_status !== 'none'), queryFn: () => apiClient!.get<AdminSupportEscalationDelivery>(`/admin/support/tickets/${ticketId}/escalation-delivery`), refetchInterval: (query) => query.state.data?.state === 'delivered' ? false : 10_000 });
  const thread = useInfiniteQuery({
    queryKey: queryKeys.adminSupportThread(account?.id ?? '', ticketId), enabled: Boolean(account && apiClient && eligible && ticketId), initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => apiClient!.get<SupportMessagePage>(`/admin/support/tickets/${ticketId}/messages?limit=50${pageParam ? `&before=${encodeURIComponent(pageParam)}` : ''}`),
    getNextPageParam: (page) => page.next_cursor ?? undefined, refetchInterval: 10_000,
  });
  const refresh = useCallback(() => { if (!eligible) return; void detail.refetch(); void thread.refetch(); }, [eligible, detail.refetch, thread.refetch]);
  useFocusEffect(refresh);
  const serverMessages = thread.data?.pages.slice().reverse().flatMap((page) => page.items) ?? [];
  const localMessages: DisplayMessage[] = pendingReplies.filter(item => item.ticketId === ticketId).map(item => ({ id: item.clientMessageId, sender_id: account?.user.id ?? null, side: 'shared_inbox', body: item.body, created_at: new Date(item.createdAt).toISOString(), localId: item.id, delivery: item.state === 'failed_permanent' ? 'failed' : 'pending' }));
  const messages: DisplayMessage[] = [...serverMessages, ...localMessages];
  const latest = serverMessages.at(-1);
  useEffect(() => {
    if (!apiClient || !eligible || !latest || latest.side !== 'requester') return;
    void markRead(ticketId, latest.id);
  }, [apiClient, eligible, latest?.id, latest?.side, ticketId, account?.id]);
  if (!enabled) return <FeatureUnavailable />;
  if (!account || !apiClient || !eligible) return null;
  const canReply = canQueueAdminReply(detail.data?.status ?? 'closed', enabled);
  const send = async () => {
    const value = reply.trim();
    if (!value || !canReply) return;
    setReply('');
    await enqueueReply(ticketId, value);
  };
  const applyAction = async (action: AdminTicketAction) => {
    if (!detail.data || pendingAction) return;
    await enqueueAction(ticketId, detail.data.version, action);
  };
  const controls = (label: string, field: 'status' | 'category' | 'priority', options: readonly (readonly [string, string])[], current: string) => <View style={styles.controlGroup}><Text style={styles.controlLabel}>{label}</Text><View style={styles.chips}>{options.map(([value, title]) => <Pressable key={value} disabled={Boolean(pendingAction) || value === current} style={[styles.chip, value === current && styles.chipActive]} onPress={() => void applyAction({ kind: 'metadata', field, value })}><Text style={[styles.chipText, value === current && styles.chipTextActive]}>{title}</Text></Pressable>)}</View></View>;
  return <Screen><KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={styles.header}><Pressable onPress={() => router.back()}><Text style={styles.back}>Назад</Text></Pressable><Text numberOfLines={2} style={styles.title}>{detail.data?.subject ?? 'Обращение'}</Text><Text style={styles.status}>{detail.data?.status ?? 'Загрузка'}</Text></View>
    {network.isConnected === false ? <Text style={styles.offline}>Офлайн: ответы и изменения обработки сохраняются в очередь до подключения.</Text> : null}
    {pendingRead ? <Pressable disabled={pendingRead.state !== 'failed_permanent'} onPress={() => void retryRead(pendingRead.id)}><Text style={pendingRead.state === 'failed_permanent' ? styles.error : styles.saving}>{pendingRead.state === 'failed_permanent' ? 'Не удалось синхронизировать прочтение. Повторить.' : 'Прочтение сохранено на устройстве и ожидает подтверждения сервера.'}</Text></Pressable> : null}
    {delivery.data ? <View style={[styles.deliveryCard, delivery.data.sla_breached && styles.deliveryLate]}><Text style={styles.controlsTitle}>Доставка эскалации</Text><Text style={styles.deliveryState}>{escalationDeliveryLabel(delivery.data.state)}</Text><Text style={styles.deliveryMeta}>Попыток: {delivery.data.attempts}</Text>{delivery.data.pending_age_seconds !== null ? <Text style={styles.deliveryMeta}>В очереди: {delivery.data.pending_age_seconds} сек.</Text> : null}{delivery.data.delivery_latency_seconds !== null ? <Text style={styles.deliveryMeta}>Доставлено за {delivery.data.delivery_latency_seconds} сек.</Text> : null}<Text style={[styles.deliveryMeta, delivery.data.sla_breached && styles.deliveryLateText]}>{delivery.data.sla_breached ? 'SLA превышен' : `SLA: ${delivery.data.sla_seconds} сек.`}</Text></View> : null}
    {detail.data ? <View style={styles.controls}>
      <Text style={styles.controlsTitle}>Обработка обращения</Text>
      {controls('Статус', 'status', statuses, detail.data.status)}
      {controls('Категория', 'category', categories, detail.data.category)}
      {controls('Приоритет', 'priority', priorities, detail.data.priority)}
      <View style={styles.controlGroup}><Text style={styles.controlLabel}>Исполнитель</Text><View style={styles.chips}><Pressable disabled={Boolean(pendingAction) || detail.data.assignee_id === null} style={[styles.chip, detail.data.assignee_id === null && styles.chipActive]} onPress={() => void applyAction({ kind: 'assignment', assigneeId: null })}><Text style={[styles.chipText, detail.data.assignee_id === null && styles.chipTextActive]}>Не назначен</Text></Pressable>{assignees.data?.map((item) => <Pressable key={item.id} disabled={Boolean(pendingAction) || detail.data?.assignee_id === item.id} style={[styles.chip, detail.data?.assignee_id === item.id && styles.chipActive]} onPress={() => void applyAction({ kind: 'assignment', assigneeId: item.id })}><Text style={[styles.chipText, detail.data?.assignee_id === item.id && styles.chipTextActive]}>{item.name}</Text></Pressable>)}</View></View>
      {pendingAction ? <View><Text style={pendingAction.state === 'conflict' || pendingAction.state === 'failed_permanent' ? styles.error : styles.saving}>{pendingAction.state === 'conflict' ? 'Конфликт версии: серверное состояние обновлено. Удалите действие и повторите намерение.' : pendingAction.state === 'failed_permanent' ? 'Изменение отклонено сервером.' : 'Изменение ожидает подтверждения сервера без локального опережения.'}</Text>{pendingAction.state === 'conflict' || pendingAction.state === 'failed_permanent' ? <Pressable onPress={() => void discardAction(pendingAction.id)}><Text style={styles.more}>Удалить действие</Text></Pressable> : null}</View> : null}
    </View> : null}
    {thread.isLoading && !messages.length ? <ActivityIndicator color={colors.primary} /> : null}
    <FlatList
      data={messages} keyExtractor={(item) => item.localId ?? item.id} contentContainerStyle={styles.list}
      ListHeaderComponent={thread.hasNextPage ? <Pressable disabled={thread.isFetchingNextPage} onPress={() => void thread.fetchNextPage()}><Text style={styles.more}>{thread.isFetchingNextPage ? 'Загрузка…' : 'Показать ранние сообщения'}</Text></Pressable> : null}
      ListEmptyComponent={!thread.isLoading ? <Text style={styles.empty}>Сообщений пока нет</Text> : null}
      renderItem={({ item }) => { const own = item.side !== 'requester'; return <View style={[styles.messageRow, own && styles.ownRow]}><View style={[styles.bubble, own ? styles.own : styles.requester]}><Text style={[styles.label, own && styles.ownMeta]}>{adminMessageLabel(item.side)}</Text><Text style={[styles.message, own && styles.ownText]}>{item.body}</Text><Text style={[styles.time, own && styles.ownMeta]}>{new Date(item.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</Text>{item.delivery ? <Pressable disabled={item.delivery !== 'failed'} onPress={() => item.localId && void retryReply(item.localId)}><Text style={[styles.time, own && styles.ownMeta]}>{item.delivery === 'failed' ? 'Не отправлено. Повторить' : 'Ожидает отправки…'}</Text></Pressable> : null}</View></View>; }}
    />
    {!canReply ? <Text style={styles.closed}>Обращение закрыто. Переписка доступна только для чтения.</Text> : <View style={styles.composer}><TextInput value={reply} onChangeText={setReply} maxLength={4000} multiline placeholder="Ответить пользователю" placeholderTextColor={colors.muted} style={styles.input} /><Pressable disabled={!reply.trim()} style={[styles.send, !reply.trim() && styles.disabled]} onPress={() => void send()}><Text style={styles.sendText}>Отправить</Text></Pressable><Text style={styles.note}>Текст сохраняется в очередь офлайн. Вложения и push пока недоступны.</Text></View>}
  </KeyboardAvoidingView></Screen>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, header: { marginBottom: 12 }, back: { color: colors.primary, fontSize: 15, fontWeight: '700', marginBottom: 12 }, title: { color: colors.ink, fontSize: 25, fontWeight: '800' }, status: { color: colors.primary, fontWeight: '700', marginTop: 6 }, offline: { color: colors.danger, backgroundColor: colors.surface, borderRadius: 12, padding: 12, marginBottom: 10 }, deliveryCard: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 10 }, deliveryLate: { borderColor: colors.danger }, deliveryState: { color: colors.primary, fontWeight: '800', marginTop: 9 }, deliveryMeta: { color: colors.muted, fontSize: 12, marginTop: 5 }, deliveryLateText: { color: colors.danger, fontWeight: '700' }, controls: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 10 }, controlsTitle: { color: colors.ink, fontSize: 17, fontWeight: '800' }, controlGroup: { marginTop: 12 }, controlLabel: { color: colors.muted, fontSize: 12, fontWeight: '700', marginBottom: 7 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, chip: { borderColor: colors.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7 }, chipActive: { backgroundColor: colors.primary, borderColor: colors.primary }, chipText: { color: colors.ink, fontSize: 12, fontWeight: '600' }, chipTextActive: { color: colors.white }, saving: { color: colors.primary, fontSize: 12, marginTop: 10 }, list: { gap: 8, paddingVertical: 10, flexGrow: 1 }, more: { color: colors.primary, fontWeight: '700', textAlign: 'center', padding: 10 }, empty: { color: colors.muted, textAlign: 'center', marginTop: 50 }, messageRow: { alignItems: 'flex-start' }, ownRow: { alignItems: 'flex-end' }, bubble: { maxWidth: '86%', borderRadius: 17, paddingHorizontal: 14, paddingVertical: 10 }, own: { backgroundColor: colors.primary }, requester: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }, label: { color: colors.primary, fontSize: 11, fontWeight: '800', marginBottom: 5 }, message: { color: colors.ink, fontSize: 15, lineHeight: 21 }, ownText: { color: colors.white }, time: { color: colors.muted, fontSize: 11, marginTop: 5 }, ownMeta: { color: colors.primarySoft }, composer: { borderTopColor: colors.border, borderTopWidth: 1, paddingTop: 10 }, input: { minHeight: 48, maxHeight: 110, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 10, color: colors.ink }, send: { alignSelf: 'flex-end', backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10, marginTop: 8 }, disabled: { opacity: 0.45 }, sendText: { color: colors.white, fontWeight: '700' }, note: { color: colors.muted, fontSize: 11, marginTop: 5 }, closed: { color: colors.muted, backgroundColor: colors.surface, borderRadius: 13, padding: 13, textAlign: 'center' }, error: { color: colors.danger, marginBottom: 8 },
});
