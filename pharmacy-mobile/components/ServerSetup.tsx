import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography, shadows } from '../lib/theme';
import { testConnection, setServerUrl } from '../lib/api';
import { LinearGradient } from 'expo-linear-gradient';

interface ServerSetupProps {
  onConnected: () => void;
}

export default function ServerSetup({ onConnected }: ServerSetupProps) {
  const [ip, setIp] = useState('');
  const [port, setPort] = useState('3000');
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');

  const handleConnect = async () => {
    const url = `http://${ip.trim()}:${port.trim()}`;
    setTesting(true);
    setError('');

    const ok = await testConnection(url);
    if (ok) {
      await setServerUrl(url);
      onConnected();
    } else {
      setError('Cannot reach server. Check IP & ensure backend is running.');
    }
    setTesting(false);
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.inner}>
        <View style={styles.iconCircle}>
          <Ionicons name="server-outline" size={40} color={colors.primary} />
        </View>
        <Text style={styles.title}>Connect to Pharmacy Server</Text>
        <Text style={styles.subtitle}>Enter your PC's local IP address{'\n'}(both devices must be on same Wi-Fi)</Text>

        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, { flex: 2 }]}
            value={ip}
            onChangeText={setIp}
            placeholder="192.168.1.100"
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
            autoFocus
          />
          <Text style={styles.colon}>:</Text>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={port}
            onChangeText={setPort}
            placeholder="3000"
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity onPress={handleConnect} disabled={testing || !ip.trim()} activeOpacity={0.8}>
          <LinearGradient
            colors={[colors.primary, colors.primaryDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.button, (!ip.trim() || testing) && styles.buttonDisabled]}
          >
            {testing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="link-outline" size={20} color="#fff" />
                <Text style={styles.buttonText}>Connect</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  inner: { alignItems: 'center' },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    ...shadows.card,
  },
  title: { ...typography.h2, textAlign: 'center', marginBottom: spacing.sm },
  subtitle: { ...typography.bodySmall, textAlign: 'center', marginBottom: spacing.xl },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  input: {
    backgroundColor: colors.surfaceLight,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 18,
    color: colors.textPrimary,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  colon: { ...typography.h2, color: colors.textMuted },
  error: { ...typography.bodySmall, color: colors.danger, marginBottom: spacing.md, textAlign: 'center' },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
    minWidth: 200,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
