import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../src/auth/AuthProvider';
import { colors } from '../src/theme';
import { Screen } from '../src/components/Screen';

export default function Accounts() {
  const { account, accounts, busy, switchAccount } = useAuth();
  return <Screen>
    <Pressable onPress={() => router.back()}><Text style={styles.back}>Назад</Text></Pressable>
    <Text style={styles.title}>Аккаунты</Text><Text style={styles.subtitle}>Переключайтесь между школами без выхода.</Text>
    <View style={styles.list}>{accounts.map((item) => {
      const active = item.id === account?.id;
      const name = [item.user.first_name, item.user.last_name].filter(Boolean).join(' ') || item.user.login;
      return <Pressable disabled={busy || active} key={item.id} style={[styles.account, active && styles.active]} onPress={() => void switchAccount(item.id).then(() => router.replace('/'))}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{name.slice(0, 1).toUpperCase()}</Text></View><View style={styles.accountText}><Text style={styles.name}>{name}</Text><Text style={styles.school}>{item.tenantName}</Text></View>{active ? <Text style={styles.current}>Сейчас</Text> : <Text style={styles.arrow}>›</Text>}
      </Pressable>;
    })}</View>
    <Pressable style={styles.add} onPress={() => router.push('/login?add=1')}><Text style={styles.addText}>Добавить аккаунт</Text></Pressable>
  </Screen>;
}

const styles = StyleSheet.create({
  back: { color: colors.primary, fontSize: 16, fontWeight: '600', marginTop: 4 }, title: { color: colors.ink, fontSize: 34, fontWeight: '800', marginTop: 28 }, subtitle: { color: colors.muted, fontSize: 16, marginTop: 8 },
  list: { gap: 10, marginTop: 30 }, account: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 15 }, active: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }, avatarText: { color: colors.white, fontSize: 18, fontWeight: '700' }, accountText: { flex: 1, marginLeft: 13 },
  name: { color: colors.ink, fontSize: 16, fontWeight: '700' }, school: { color: colors.muted, fontSize: 13, marginTop: 3 }, current: { color: colors.primary, fontSize: 12, fontWeight: '700' }, arrow: { color: colors.muted, fontSize: 28 },
  add: { marginTop: 18, padding: 16, alignItems: 'center' }, addText: { color: colors.primary, fontSize: 16, fontWeight: '700' },
});
