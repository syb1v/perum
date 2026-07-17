import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../src/auth/AuthProvider';
import { AccountQueryProvider } from '../src/query/AccountQueryProvider';
import { colors } from '../src/theme';
import { LinkProvider } from '../src/links/LinkProvider';
import { PushProvider } from '../src/push/PushProvider';
import { TenantDescriptorProvider } from '../src/auth/TenantDescriptorProvider';
import { CapabilityProvider } from '../src/auth/CapabilityProvider';

export default function RootLayout() {
  return <SafeAreaProvider><AuthProvider><CapabilityProvider><TenantDescriptorProvider /><LinkProvider /><PushProvider><AccountQueryProvider><StatusBar style="dark" /><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} /></AccountQueryProvider></PushProvider></CapabilityProvider></AuthProvider></SafeAreaProvider>;
}
