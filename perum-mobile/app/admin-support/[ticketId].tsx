import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNetInfo } from '@react-native-community/netinfo';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../../src/auth/AuthProvider';
import { useCapabilities } from '../../src/auth/CapabilityProvider';
import { FeatureUnavailable } from '../../src/components/FeatureUnavailable';
import { Screen } from '../../src/components/Screen';
import { queryKeys } from '../../src/query/queryKeys';
import { adminMessageLabel, adminTicketActionPath, adminTicketActionPayload, canReplyToAdminTicket, canUseAdminSupport, isVersionConflict, type AdminTicketAction } from '../../src/support/adminCore';
import type { AdminSupportAssignee, SupportMessagePage, SupportTicket } from '../../src/support/types';
import { colors } from '../../src/theme';

const statuses = [['open', 'Открыто'], ['in_progress', 'В работе'], ['waiting_requester', 'Ждёт пользователя'], ['resolved', 'Решено'], ['closed', 'Закрыто']] as const;
const categories = [['general', 'Общее'], ['technical', 'Техническое'], ['account', 'Аккаунт'], ['academic', 'Учебное'], ['safety', 'Безопасность'], ['other', 'Другое']] as const;
const priorities = [['low', 'Низкий'], ['normal', 'Обычный'], ['high', 'Высокий'], ['urgent', 'Срочный']] as const;

export default function AdminSupportThreadScreen() {
  const { ticketId = '' } = useLocalSearchParams<{ ticketId: string }>();
  const { account, apiClient } = useAuth();
  const { has } = useCapabilities();
  const network = useNetInfo();
  const queryClient = useQueryClient();
  const [reply, setReply] = useState('');
  const [error, setError] = useState<string | null>(null);
  const replyId = useRef<string | null>(null);
  const actionIdentity = useRef<{ signature: string; id: string } | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const readMessageId = useRef<string | null>(null);
  const enabled = has('support_admin');
  const eligible = canUseAdminSupport(account?.user.role, enabled);
  const detail = useQuery({ queryKey: queryKeys.adminSupportTicket(account?.id ?? '', ticketId), enabled: Boolean(account && apiClient && eligible && ticketId), queryFn: () => apiClient!.get<SupportTicket>(`/admin/support/tickets/${ticketId}`), refetchInterval: 10_000 });
  const assignees = useQuery({ queryKey: queryKeys.adminSupportAssignees(account?.id ?? ''), enabled: Boolean(account && apiClient && eligible), queryFn: () => apiClient!.get<AdminSupportAssignee[]>('/admin/support/assignees') });
  const thread = useInfiniteQuery({
    queryKey: queryKeys.adminSupportThread(account?.id ?? '', ticketId), enabled: Boolean(account && apiClient && eligible && ticketId), initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => apiClient!.get<SupportMessagePage>(`/admin/support/tickets/${ticketId}/messages?limit=50${pageParam ? `&before=${encodeURIComponent(pageParam)}` : ''}`),
    getNextPageParam: (page) => page.next_cursor ?? undefined, refetchInterval: 10_000,
  });
  const refresh = useCallback(() => { if (!eligible) return; void detail.refetch(); void thread.refetch(); }, [eligible, detail.refetch, thread.refetch]);
  useFocusEffect(refresh);
  const messages = thread.data?.pages.slice().reverse().flatMap((page) => page.items) ?? [];
  const latest = messages.at(-1);
  useEffect(() => {
    if (!apiClient || !eligible || network.isConnected === false || !latest || latest.side !== 'requester' || readMessageId.current === latest.id) return;
    readMessageId.current = latest.id;
    void apiClient.post(`/admin/support/tickets/${ticketId}/read`, { client_action_id: crypto.randomUUID(), message_id: latest.id }).then(() => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminSupportTickets(account!.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminSupportUnread(account!.id) });
    }).catch(() => { readMessageId.current = null; });
  }, [apiClient, eligible, network.isConnected, latest?.id, latest?.side, ticketId, account?.id]);
  if (!enabled) return <FeatureUnavailable />;
  if (!account || !apiClient || !eligible) return null;
  const canReply = canReplyToAdminTicket(detail.data?.status ?? 'closed', network.isConnected !== false);
  const send = async () => {
    const value = reply.trim();
    if (!value || !canReply) return;
    const clientMessageId = replyId.current ?? crypto.randomUUID();
    replyId.current = clientMessageId;
    setError(null);
    try {
      await apiClient.post(`/admin/support/tickets/${ticketId}/messages`, { client_message_id: clientMessageId, body: value });
      replyId.current = null;
      setReply('');
      await Promise.all([
        thread.refetch(), detail.refetch(),
        queryClient.invalidateQueries({ queryKey: queryKeys.adminSupportTickets(account.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.adminSupportUnread(account.id) }),
      ]);
    } catch {
      setError('Не удалось отправить ответ. Повтор использует тот же идентификатор и не создаст дубль.');
    }
  };
  const applyAction = async (action: AdminTicketAction) => {
    if (!detail.data || network.isConnected === false || actionBusy) return;
    const signature = JSON.stringify(action);
    const clientActionId = actionIdentity.current?.signature === signature ? actionIdentity.current.id : crypto.randomUUID();
    actionIdentity.current = { signature, id: clientActionId };
    setActionBusy(true);
    setError(null);
    try {
      const payload = adminTicketActionPayload(action, detail.data.version, clientActionId);
      const next = action.kind === 'assignment'
        ? await apiClient.post<SupportTicket>(adminTicketActionPath(ticketId, action), payload)
        : await apiClient.patch<SupportTicket>(adminTicketActionPath(ticketId, action), payload);
      queryClient.setQueryData(queryKeys.adminSupportTicket(account.id, ticketId), next);
      actionIdentity.current = null;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.adminSupportTickets(account.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.adminSupportUnread(account.id) }),
      ]);
    } catch (caught) {
      if (isVersionConflict(caught)) {
        actionIdentity.current = null;
        setError('Обращение изменил другой сотрудник. Показано актуальное состояние сервера.');
        await Promise.all([detail.refetch(), queryClient.invalidateQueries({ queryKey: queryKeys.adminSupportTickets(account.id) }), queryClient.invalidateQueries({ queryKey: queryKeys.adminSupportUnread(account.id) })]);
      } else {
        setError('Изменение не сохранено. Повторите действие.');
      }
    } finally {
      setActionBusy(false);
    }
  };
  const controls = (label: string, field: 'status' | 'category' | 'priority', options: readonly (readonly [string, string])[], current: string) => <View style={styles.controlGroup}><Text style={styles.controlLabel}>{label}</Text><View style={styles.chips}>{options.map(([value, title]) => <Pressable key={value} disabled={actionBusy || network.isConnected === false || value === current} style={[styles.chip, value === current && styles.chipActive]} onPress={() => void applyAction({ kind: 'metadata', field, value })}><Text style={[styles.chipText, value === current && styles.chipTextActive]}>{title}</Text></Pressable>)}</View></View>;
  return <Screen><KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={styles.header}><Pressable onPress={() => router.back()}><Text style={styles.back}>Назад</Text></Pressable><Text numberOfLines={2} style={styles.title}>{detail.data?.subject ?? 'Обращение'}</Text><Text style={styles.status}>{detail.data?.status ?? 'Загрузка'}</Text></View>
    {network.isConnected === false ? <Text style={styles.offline}>Офлайн: доступна сохранённая переписка. Ответить можно после подключения.</Text> : null}
    {detail.data ? <View style={styles.controls}>
      <Text style={styles.controlsTitle}>Обработка обращения</Text>
      {controls('Статус', 'status', statuses, detail.data.status)}
      {controls('Категория', 'category', categories, detail.data.category)}
      {controls('Приоритет', 'priority', priorities, detail.data.priority)}
      <View style={styles.controlGroup}><Text style={styles.controlLabel}>Исполнитель</Text><View style={styles.chips}><Pressable disabled={actionBusy || network.isConnected === false || detail.data.assignee_id === null} style={[styles.chip, detail.data.assignee_id === null && styles.chipActive]} onPress={() => void applyAction({ kind: 'assignment', assigneeId: null })}><Text style={[styles.chipText, detail.data.assignee_id === null && styles.chipTextActive]}>Не назначен</Text></Pressable>{assignees.data?.map((item) => <Pressable key={item.id} disabled={actionBusy || network.isConnected === false || detail.data?.assignee_id === item.id} style={[styles.chip, detail.data?.assignee_id === item.id && styles.chipActive]} onPress={() => void applyAction({ kind: 'assignment', assigneeId: item.id })}><Text style={[styles.chipText, detail.data?.assignee_id === item.id && styles.chipTextActive]}>{item.name}</Text></Pressable>)}</View></View>
      {actionBusy ? <Text style={styles.saving}>Сохраняем без локального опережения…</Text> : null}
    </View> : null}
    {thread.isLoading && !messages.length ? <ActivityIndicator color={colors.primary} /> : null}
    <FlatList
      data={messages} keyExtractor={(item) => item.id} contentContainerStyle={styles.list}
      ListHeaderComponent={thread.hasNextPage ? <Pressable disabled={thread.isFetchingNextPage} onPress={() => void thread.fetchNextPage()}><Text style={styles.more}>{thread.isFetchingNextPage ? 'Загрузка…' : 'Показать ранние сообщения'}</Text></Pressable> : null}
      ListEmptyComponent={!thread.isLoading ? <Text style={styles.empty}>Сообщений пока нет</Text> : null}
      renderItem={({ item }) => { const own = item.side !== 'requester'; return <View style={[styles.messageRow, own && styles.ownRow]}><View style={[styles.bubble, own ? styles.own : styles.requester]}><Text style={[styles.label, own && styles.ownMeta]}>{adminMessageLabel(item.side)}</Text><Text style={[styles.message, own && styles.ownText]}>{item.body}</Text><Text style={[styles.time, own && styles.ownMeta]}>{new Date(item.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</Text></View></View>; }}
    />
    {error ? <Text style={styles.error}>{error}</Text> : null}
    {!canReply ? <Text style={styles.closed}>{detail.data?.status === 'closed' ? 'Обращение закрыто. Переписка доступна только для чтения.' : 'Ответы доступны только при подключении к сети.'}</Text> : <View style={styles.composer}><TextInput value={reply} onChangeText={(value) => { setReply(value); replyId.current = null; }} maxLength={4000} multiline placeholder="Ответить пользователю" placeholderTextColor={colors.muted} style={styles.input} /><Pressable disabled={!reply.trim()} style={[styles.send, !reply.trim() && styles.disabled]} onPress={() => void send()}><Text style={styles.sendText}>Отправить</Text></Pressable><Text style={styles.note}>Только текст. Вложения и push пока недоступны.</Text></View>}
  </KeyboardAvoidingView></Screen>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, header: { marginBottom: 12 }, back: { color: colors.primary, fontSize: 15, fontWeight: '700', marginBottom: 12 }, title: { color: colors.ink, fontSize: 25, fontWeight: '800' }, status: { color: colors.primary, fontWeight: '700', marginTop: 6 }, offline: { color: colors.danger, backgroundColor: colors.surface, borderRadius: 12, padding: 12, marginBottom: 10 }, controls: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 10 }, controlsTitle: { color: colors.ink, fontSize: 17, fontWeight: '800' }, controlGroup: { marginTop: 12 }, controlLabel: { color: colors.muted, fontSize: 12, fontWeight: '700', marginBottom: 7 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, chip: { borderColor: colors.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7 }, chipActive: { backgroundColor: colors.primary, borderColor: colors.primary }, chipText: { color: colors.ink, fontSize: 12, fontWeight: '600' }, chipTextActive: { color: colors.white }, saving: { color: colors.primary, fontSize: 12, marginTop: 10 }, list: { gap: 8, paddingVertical: 10, flexGrow: 1 }, more: { color: colors.primary, fontWeight: '700', textAlign: 'center', padding: 10 }, empty: { color: colors.muted, textAlign: 'center', marginTop: 50 }, messageRow: { alignItems: 'flex-start' }, ownRow: { alignItems: 'flex-end' }, bubble: { maxWidth: '86%', borderRadius: 17, paddingHorizontal: 14, paddingVertical: 10 }, own: { backgroundColor: colors.primary }, requester: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }, label: { color: colors.primary, fontSize: 11, fontWeight: '800', marginBottom: 5 }, message: { color: colors.ink, fontSize: 15, lineHeight: 21 }, ownText: { color: colors.white }, time: { color: colors.muted, fontSize: 11, marginTop: 5 }, ownMeta: { color: colors.primarySoft }, composer: { borderTopColor: colors.border, borderTopWidth: 1, paddingTop: 10 }, input: { minHeight: 48, maxHeight: 110, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 10, color: colors.ink }, send: { alignSelf: 'flex-end', backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10, marginTop: 8 }, disabled: { opacity: 0.45 }, sendText: { color: colors.white, fontWeight: '700' }, note: { color: colors.muted, fontSize: 11, marginTop: 5 }, closed: { color: colors.muted, backgroundColor: colors.surface, borderRadius: 13, padding: 13, textAlign: 'center' }, error: { color: colors.danger, marginBottom: 8 },
});
