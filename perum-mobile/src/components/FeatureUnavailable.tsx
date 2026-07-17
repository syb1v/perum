import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Screen } from './Screen';
import { colors } from '../theme';

export function FeatureUnavailable() {
  return <Screen><Text style={styles.title}>Функция недоступна</Text><Text style={styles.body}>Эта функция пока недоступна для вашей школы.</Text><Pressable onPress={() => router.back()}><Text style={styles.back}>Назад</Text></Pressable></Screen>;
}

const styles = StyleSheet.create({ title: { color: colors.ink, fontSize: 30, fontWeight: '800', marginTop: 30 }, body: { color: colors.muted, fontSize: 16, lineHeight: 23, marginTop: 12 }, back: { color: colors.primary, fontSize: 16, fontWeight: '700', marginTop: 28 } });
