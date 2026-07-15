import { Redirect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../src/auth/AuthProvider';
import { colors } from '../src/theme';
import { Screen } from '../src/components/Screen';
import { targetRoute, type LinkTarget } from '../src/links/core';

export default function Login() {
  const { account, busy, error, signIn, clearError } = useAuth();
  const { add, host: initialHost, target } = useLocalSearchParams<{ add?: string; host?: string; target?: LinkTarget['target'] }>();
  const [host, setHost] = useState(initialHost ?? '');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  if (account && add !== '1') return <Redirect href={(targetRoute(target ?? 'home', account.user.role) ?? '/') as never} />;
  const disabled = busy || !host.trim() || !login.trim() || !password;
  return <Screen><KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={styles.brand}><Text style={styles.brandText}>PERUM</Text></View>
    <Text style={styles.title}>Ваша школа{`\n`}всегда рядом</Text>
    <Text style={styles.subtitle}>Введите адрес школы и данные своего аккаунта.</Text>
    <View style={styles.form}>
      <Text style={styles.label}>Адрес школы</Text>
      <TextInput autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="school.perum.app" placeholderTextColor="#929A94" style={styles.input} value={host} onChangeText={(value) => { setHost(value); clearError(); }} />
      <Text style={styles.label}>Логин</Text>
      <TextInput autoCapitalize="none" autoCorrect={false} placeholder="Ваш логин" placeholderTextColor="#929A94" style={styles.input} value={login} onChangeText={(value) => { setLogin(value); clearError(); }} />
      <Text style={styles.label}>Пароль</Text>
      <TextInput secureTextEntry placeholder="Ваш пароль" placeholderTextColor="#929A94" style={styles.input} value={password} onChangeText={(value) => { setPassword(value); clearError(); }} onSubmitEditing={() => !disabled && void signIn(host, login, password)} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable disabled={disabled} style={[styles.button, disabled && styles.buttonDisabled]} onPress={() => void signIn(host, login, password)}><Text style={styles.buttonText}>{busy ? 'Подключаемся…' : 'Войти'}</Text></Pressable>
    </View>
  </KeyboardAvoidingView></Screen>;
}

const styles = StyleSheet.create({
  page: { flex: 1 }, brand: { alignSelf: 'flex-start', backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginTop: 10 },
  brandText: { color: colors.white, fontSize: 12, fontWeight: '800', letterSpacing: 2 }, title: { color: colors.ink, fontSize: 38, lineHeight: 43, fontWeight: '800', marginTop: 30 },
  subtitle: { color: colors.muted, fontSize: 16, lineHeight: 23, marginTop: 12, maxWidth: 330 }, form: { marginTop: 32 }, label: { color: colors.ink, fontSize: 13, fontWeight: '600', marginBottom: 7, marginTop: 13 },
  input: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 14, color: colors.ink, fontSize: 16, paddingHorizontal: 16, paddingVertical: 15 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20, marginTop: 14 }, button: { backgroundColor: colors.primary, borderRadius: 16, padding: 17, alignItems: 'center', marginTop: 22 },
  buttonDisabled: { opacity: 0.45 }, buttonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
});
