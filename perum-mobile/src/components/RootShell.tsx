import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState, type PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { colors } from '../theme';

export function RootShell({ children }: PropsWithChildren) {
  const { ready, error, clearError } = useAuth();
  const [offline, setOffline] = useState(false);
  useEffect(() => NetInfo.addEventListener((state) => setOffline(state.isConnected === false)), []);
  return <View style={styles.root}>
    {offline ? <View style={styles.offline}><Text style={styles.offlineText}>Нет сети. Доступны сохранённые данные.</Text></View> : null}
    {ready && error ? <View style={styles.error}><Text style={styles.errorText} numberOfLines={2}>{error}</Text><Pressable onPress={clearError}><Text style={styles.close}>Закрыть</Text></Pressable></View> : null}
    <View style={styles.content}>{children}</View>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background }, content: { flex: 1 },
  offline: { backgroundColor: '#E9A23B', paddingHorizontal: 16, paddingVertical: 7 }, offlineText: { color: '#2B2113', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  error: { alignItems: 'center', backgroundColor: '#FDECEA', flexDirection: 'row', gap: 12, justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 9 }, errorText: { color: colors.danger, flex: 1, fontSize: 13 }, close: { color: colors.danger, fontSize: 13, fontWeight: '700' },
});
