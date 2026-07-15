import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuth } from '../src/auth/AuthProvider';
import { routeForRole } from '../src/auth/routes';
import type { TenantRole } from '../src/auth/types';
import { colors } from '../src/theme';

export default function Index() {
  const { ready, account } = useAuth();
  if (!ready) return <View style={styles.loading}><ActivityIndicator color={colors.primary} size="large" /></View>;
  if (!account) return <Redirect href="/login" />;
  return <Redirect href={routeForRole(account.user.role as TenantRole)} />;
}

const styles = StyleSheet.create({ loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background } });
