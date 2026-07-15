import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme';

export function Screen({ children }: PropsWithChildren) {
  return <SafeAreaView style={styles.safe}><View style={styles.content}>{children}</View></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, paddingHorizontal: 22, paddingVertical: 18 },
});
