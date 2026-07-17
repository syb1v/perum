import { useInfiniteQuery } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../../src/auth/AuthProvider';
import { Screen } from '../../../src/components/Screen';
import { queryKeys } from '../../../src/query/queryKeys';
import { colors } from '../../../src/theme';
import type { ConversationPage } from '../../../src/messages/types';
import { useRealtimeStatus } from '../../../src/realtime/RealtimeProvider';
import { useCapabilities } from '../../../src/auth/CapabilityProvider';
import { FeatureUnavailable } from '../../../src/components/FeatureUnavailable';

export default function MessagesScreen() {
  const { account, apiClient } = useAuth();
  const { has } = useCapabilities();
  const enabled = has('social_messages');
  const realtime = useRealtimeStatus();
  const conversations = useInfiniteQuery({
    queryKey: queryKeys.conversations(account?.id ?? ''),
    enabled: Boolean(enabled && account && apiClient),
    initialPageParam: null as number | null,
    queryFn: ({ pageParam }) => apiClient!.get<ConversationPage>(`/social/conversations?limit=30${pageParam === null ? '' : `&cursor=${pageParam}`}`),
    getNextPageParam: (page) => page.next_cursor ?? undefined,
    refetchInterval: 15_000,
  });
  useFocusEffect(useCallback(() => { if (enabled) void conversations.refetch(); }, [enabled, conversations.refetch]));
  if (!enabled) return <FeatureUnavailable />;
  const items = conversations.data?.pages.flatMap((page) => page.items) ?? [];
  return <Screen>
    <View style={styles.header}><Pressable onPress={() => router.back()}><Text style={styles.back}>Назад</Text></Pressable><Text style={styles.title}>Сообщения</Text>{realtime !== 'connected' ? <Text style={styles.status}>{realtime === 'reconnecting' ? 'Переподключение…' : 'Обновление по опросу'}</Text> : null}</View>
    {conversations.isLoading && !items.length ? <ActivityIndicator color={colors.primary} /> : null}
    <FlatList
      data={items}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={styles.list}
      onEndReached={() => { if (conversations.hasNextPage && !conversations.isFetchingNextPage) void conversations.fetchNextPage(); }}
      ListEmptyComponent={<Text style={styles.empty}>Диалогов пока нет</Text>}
      ListFooterComponent={conversations.isFetchingNextPage ? <ActivityIndicator color={colors.primary} /> : null}
      renderItem={({ item }) => <Pressable style={styles.row} onPress={() => router.push({ pathname: '/(student)/messages/[conversationId]', params: { conversationId: String(item.id) } })}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{item.peer.name.slice(0, 1).toUpperCase()}</Text></View>
        <View style={styles.content}><Text numberOfLines={1} style={styles.name}>{item.peer.name}</Text><Text numberOfLines={1} style={styles.preview}>{item.last_message?.body ?? item.peer.class_name}</Text></View>
        {item.unread_count > 0 ? <View style={styles.unread}><Text style={styles.unreadText}>{item.unread_count > 99 ? '99+' : item.unread_count}</Text></View> : null}
      </Pressable>}
    />
  </Screen>;
}

const styles = StyleSheet.create({
  header: { marginBottom: 22 }, back: { color: colors.primary, fontSize: 15, fontWeight: '700', marginBottom: 14 }, title: { color: colors.ink, fontSize: 32, fontWeight: '800' }, status: { color: colors.muted, fontSize: 12, marginTop: 5 },
  list: { gap: 10, paddingBottom: 30, flexGrow: 1 }, row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 15 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }, avatarText: { color: colors.white, fontSize: 19, fontWeight: '800' },
  content: { flex: 1, marginLeft: 13 }, name: { color: colors.ink, fontSize: 16, fontWeight: '700' }, preview: { color: colors.muted, marginTop: 5 }, unread: { minWidth: 24, height: 24, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }, unreadText: { color: colors.white, fontSize: 11, fontWeight: '800' }, empty: { color: colors.muted, textAlign: 'center', marginTop: 60 },
});
