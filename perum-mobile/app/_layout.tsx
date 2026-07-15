import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../src/auth/AuthProvider';
import { AccountQueryProvider } from '../src/query/AccountQueryProvider';
import { colors } from '../src/theme';

export default function RootLayout() {
  return <SafeAreaProvider><AuthProvider><AccountQueryProvider><StatusBar style="dark" /><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} /></AccountQueryProvider></AuthProvider></SafeAreaProvider>;
}
