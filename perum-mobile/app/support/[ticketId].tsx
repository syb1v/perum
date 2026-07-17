import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../../src/auth/AuthProvider';
import { Screen } from '../../src/components/Screen';
import { queryKeys } from '../../src/query/queryKeys';
import { useSupportSync } from '../../src/support/SupportProvider';
import type { SupportMessage, SupportMessagePage, SupportTicket } from '../../src/support/types';
import { colors } from '../../src/theme';
import { useCapabilities } from '../../src/auth/CapabilityProvider';
import { FeatureUnavailable } from '../../src/components/FeatureUnavailable';

const statuses: Record<string, string> = { open: 'Открыто', in_progress: 'В работе', waiting_requester: 'Ждёт вашего ответа', resolved: 'Решено', closed: 'Закрыто' };
type DisplayMessage = SupportMessage & { localId?: string; delivery?: 'pending' | 'failed' };

export default function SupportThreadScreen() {
  const { ticketId = '' } = useLocalSearchParams<{ ticketId: string }>();
  const { account, apiClient } = useAuth();
  const { has } = useCapabilities();
  const enabled = has('support_requester');
  const sendEnabled = enabled && has('offline_support_messages');
  const sync = useSupportSync();
  const localTicket = sync.pendingTickets.find((item) => item.id === ticketId);
  const isLocal = Boolean(localTicket);
  const [reply, setReply] = useState('');
  const eligible = account?.user.role === 'student' || account?.user.role === 'parent' || account?.user.role === 'teacher';
  const detail = useQuery({ queryKey: queryKeys.supportTicket(account?.id ?? '', ticketId), enabled: Boolean(enabled && account && apiClient && eligible && ticketId && !isLocal), queryFn: () => apiClient!.get<SupportTicket>(`/support/tickets/${ticketId}`), refetchInterval: 10_000 });
  const thread = useInfiniteQuery({
    queryKey: queryKeys.supportThread(account?.id ?? '', ticketId), enabled: Boolean(enabled && account && apiClient && eligible && ticketId && !isLocal), initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => apiClient!.get<SupportMessagePage>(`/support/tickets/${ticketId}/messages?limit=50${pageParam ? `&before=${encodeURIComponent(pageParam)}` : ''}`),
    getNextPageParam: (page) => page.next_cursor ?? undefined, refetchInterval: 10_000,
  });
  const refresh = useCallback(() => { if (!enabled || !eligible || isLocal) return; void detail.refetch(); void thread.refetch(); }, [enabled, eligible, isLocal, detail.refetch, thread.refetch]);
  useFocusEffect(refresh);
  useEffect(() => {
    if (localTicket?.serverTicketId) router.replace({ pathname: '/support/[ticketId]', params: { ticketId: localTicket.serverTicketId } });
  }, [localTicket?.serverTicketId]);
  const serverMessages = thread.data?.pages.slice().reverse().flatMap((page) => page.items) ?? [];
  const latest = serverMessages.at(-1);
  useEffect(() => {
    if (!enabled || !account || !apiClient || !latest) return;
    void sync.markRead(ticketId, latest.id);
  }, [enabled, account?.id, apiClient, latest?.id, ticketId]);
  if (!enabled) return <FeatureUnavailable />;
  if (!account || !apiClient || !eligible) return null;
  if (localTicket) return <Screen><View style={styles.screen}>
    <View style={styles.header}><Pressable onPress={() => router.back()}><Text style={styles.back}>Назад</Text></Pressable><Text numberOfLines={2} style={styles.title}>{localTicket.subject}</Text><Text style={styles.status}>{localTicket.state === 'failed_permanent' ? 'Не отправлено' : 'Ожидает отправки'}</Text></View>
    <View style={[styles.bubble, styles.own, styles.localBubble]}><Text style={[styles.message, styles.ownText]}>{localTicket.body}</Text><Text style={[styles.time, styles.ownTime]}>{new Date(localTicket.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</Text></View>
    {localTicket.state === 'failed_permanent' ? <Pressable style={styles.retryButton} onPress={() => void sync.retryTicket(localTicket.id)}><Text style={styles.sendText}>Повторить отправку</Text></Pressable> : <Text style={styles.closed}>Обращение сохранено на устройстве. Дополнительные сообщения станут доступны после создания обращения.</Text>}
  </View></Screen>;
  const optimistic: DisplayMessage[] = sync.pending.filter((item) => item.ticketId === ticketId).map((item) => ({ id: item.clientMessageId, sender_id: account.user.id, side: 'requester', body: item.body, created_at: new Date(item.createdAt).toISOString(), localId: item.id, delivery: item.state === 'failed_permanent' ? 'failed' : 'pending' }));
  const messages: DisplayMessage[] = [...serverMessages, ...optimistic];
  const closed = detail.data?.status === 'closed';
  const send = async () => { const value = reply.trim(); if (!sendEnabled || !value || closed) return; setReply(''); await sync.enqueue(ticketId, value); };
  return <Screen><KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={styles.header}><Pressable onPress={() => router.back()}><Text style={styles.back}>Назад</Text></Pressable><Text numberOfLines={2} style={styles.title}>{detail.data?.subject ?? 'Обращение'}</Text>{detail.data ? <Text style={styles.status}>{statuses[detail.data.status] ?? detail.data.status}</Text> : null}</View>
    {thread.isLoading && !messages.length ? <ActivityIndicator color={colors.primary} /> : null}
    <FlatList
      data={messages} keyExtractor={(item) => item.localId ?? item.id} contentContainerStyle={styles.list}
      ListHeaderComponent={thread.hasNextPage ? <Pressable disabled={thread.isFetchingNextPage} onPress={() => void thread.fetchNextPage()}><Text style={styles.more}>{thread.isFetchingNextPage ? 'Загрузка…' : 'Показать ранние сообщения'}</Text></Pressable> : null}
      ListEmptyComponent={!thread.isLoading ? <Text style={styles.empty}>Сообщений пока нет</Text> : null}
      renderItem={({ item }) => { const own = item.side === 'requester'; return <View style={[styles.messageRow, own && styles.ownRow]}><View style={[styles.bubble, own ? styles.own : styles.school]}><Text style={[styles.message, own && styles.ownText]}>{item.body}</Text><Text style={[styles.time, own && styles.ownTime]}>{new Date(item.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</Text>{item.delivery ? <Pressable disabled={item.delivery !== 'failed'} onPress={() => item.localId && void sync.retry(item.localId)}><Text style={[styles.delivery, own && styles.ownTime]}>{item.delivery === 'failed' ? 'Не отправлено. Повторить' : 'Отправляется…'}</Text></Pressable> : null}</View></View>; }}
    />
    {!sendEnabled ? <Text style={styles.closed}>Отправка сообщений недоступна для этой школы.</Text> : closed ? <Text style={styles.closed}>Обращение закрыто школой. Отправка сообщений недоступна.</Text> : <View style={styles.composer}><TextInput value={reply} onChangeText={setReply} maxLength={5000} multiline placeholder="Напишите сообщение" placeholderTextColor={colors.muted} style={styles.input} /><Pressable disabled={!reply.trim()} style={[styles.send, !reply.trim() && styles.disabled]} onPress={() => void send()}><Text style={styles.sendText}>Отправить</Text></Pressable><Text style={styles.note}>Только текст. Вложения пока недоступны.</Text></View>}
  </KeyboardAvoidingView></Screen>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, header: { marginBottom: 12 }, back: { color: colors.primary, fontSize: 15, fontWeight: '700', marginBottom: 12 }, title: { color: colors.ink, fontSize: 25, fontWeight: '800' }, status: { color: colors.primary, fontWeight: '700', marginTop: 6 }, list: { gap: 8, paddingVertical: 10, flexGrow: 1 }, more: { color: colors.primary, fontWeight: '700', textAlign: 'center', padding: 10 }, empty: { color: colors.muted, textAlign: 'center', marginTop: 50 }, messageRow: { alignItems: 'flex-start' }, ownRow: { alignItems: 'flex-end' }, bubble: { maxWidth: '84%', borderRadius: 17, paddingHorizontal: 14, paddingVertical: 10 }, localBubble: { alignSelf: 'flex-end', marginVertical: 16 }, own: { backgroundColor: colors.primary }, school: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }, message: { color: colors.ink, fontSize: 15, lineHeight: 21 }, ownText: { color: colors.white }, time: { color: colors.muted, fontSize: 11, marginTop: 5 }, ownTime: { color: colors.primarySoft }, delivery: { fontSize: 11, marginTop: 4 }, composer: { borderTopColor: colors.border, borderTopWidth: 1, paddingTop: 10 }, input: { minHeight: 48, maxHeight: 110, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 10, color: colors.ink }, send: { alignSelf: 'flex-end', backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10, marginTop: 8 }, retryButton: { alignSelf: 'center', backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10, marginTop: 8 }, disabled: { opacity: 0.45 }, sendText: { color: colors.white, fontWeight: '700' }, note: { color: colors.muted, fontSize: 11, marginTop: 5 }, closed: { color: colors.muted, backgroundColor: colors.surface, borderRadius: 13, padding: 13, textAlign: 'center' },
});
