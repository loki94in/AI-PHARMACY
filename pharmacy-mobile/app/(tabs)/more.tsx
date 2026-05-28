import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { colors, spacing, typography, radius, shadows } from '../../lib/theme';
import { clearServerUrl } from '../../lib/api';

const menuItems = [
  { icon: 'camera-outline', label: 'AI Camera', desc: 'Scan medicine packaging', route: '/camera', color: '#F59E0B' },
  { icon: 'search-outline', label: 'Product Trace', desc: 'Find product across purchases & sales', route: '/product-search', color: colors.accent },
  { icon: 'cloud-upload-outline', label: 'Backup & Safety', desc: 'Create backup, restore data', route: '/backup', color: colors.info },
];

export default function MoreScreen() {
  const router = useRouter();
  const [appLockEnabled, setAppLockEnabled] = useState(false);

  useEffect(() => {
    (async () => {
      const enabled = await SecureStore.getItemAsync('app_lock_enabled');
      setAppLockEnabled(enabled === 'true');
    })();
  }, []);

  const toggleAppLock = async (value: boolean) => {
    setAppLockEnabled(value);
    await SecureStore.setItemAsync('app_lock_enabled', value ? 'true' : 'false');
    if (value) {
      // Ensure there is a PIN configured, if not, set default to 1234
      const pin = await SecureStore.getItemAsync('app_lock_pin');
      if (!pin) {
        await SecureStore.setItemAsync('app_lock_pin', '1234');
        Alert.alert('App Lock Activated', 'Security lock enabled. The default unlock PIN is 1234. You can customize this PIN below.');
      } else {
        Alert.alert('App Lock Activated', 'Security lock enabled.');
      }
    } else {
      Alert.alert('App Lock Deactivated', 'Security lock disabled.');
    }
  };

  const handleChangePin = () => {
    Alert.prompt(
      'Change Security PIN',
      'Enter a new 4-digit security code:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save',
          onPress: async (pin) => {
            if (pin && pin.length === 4 && /^\d+$/.test(pin)) {
              await SecureStore.setItemAsync('app_lock_pin', pin);
              Alert.alert('PIN Updated', 'Your security code has been changed successfully.');
            } else {
              Alert.alert('Invalid Code', 'Please enter a valid 4-digit number.');
            }
          },
        },
      ],
      'secure-text'
    );
  };

  const handleDisconnect = async () => {
    await clearServerUrl();
    router.replace('/');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={[typography.label, { marginBottom: spacing.md }]}>TOOLS</Text>
      {menuItems.map((item, i) => (
        <TouchableOpacity key={i} style={styles.card} activeOpacity={0.7} onPress={() => router.push(item.route as any)}>
          <View style={[styles.iconWrap, { backgroundColor: item.color + '20' }]}>
            <Ionicons name={item.icon as any} size={24} color={item.color} />
          </View>
          <View style={styles.cardText}>
            <Text style={typography.body}>{item.label}</Text>
            <Text style={typography.bodySmall}>{item.desc}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      ))}

      <Text style={[typography.label, { marginTop: spacing.xl, marginBottom: spacing.md }]}>SECURITY</Text>
      
      {/* App Lock Switch Card */}
      <View style={styles.card}>
        <View style={[styles.iconWrap, { backgroundColor: colors.primary + '20' }]}>
          <Ionicons name="lock-closed-outline" size={24} color={colors.primary} />
        </View>
        <View style={styles.cardText}>
          <Text style={typography.body}>App Security Lock</Text>
          <Text style={typography.bodySmall}>Require Biometrics or PIN on launch</Text>
        </View>
        <Switch
          value={appLockEnabled}
          onValueChange={toggleAppLock}
          trackColor={{ false: colors.divider, true: colors.primary }}
          thumbColor={appLockEnabled ? '#fff' : '#f4f3f4'}
        />
      </View>

      {/* Change PIN Card */}
      {appLockEnabled && (
        <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={handleChangePin}>
          <View style={[styles.iconWrap, { backgroundColor: colors.accent + '20' }]}>
            <Ionicons name="key-outline" size={24} color={colors.accent} />
          </View>
          <View style={styles.cardText}>
            <Text style={typography.body}>Configure PIN Code</Text>
            <Text style={typography.bodySmall}>Change the 4-digit fallback PIN</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      )}

      <Text style={[typography.label, { marginTop: spacing.xl, marginBottom: spacing.md }]}>CONNECTION</Text>
      <TouchableOpacity style={[styles.card, styles.dangerCard]} activeOpacity={0.7} onPress={handleDisconnect}>
        <View style={[styles.iconWrap, { backgroundColor: 'rgba(239,68,68,0.15)' }]}>
          <Ionicons name="log-out-outline" size={24} color={colors.danger} />
        </View>
        <View style={styles.cardText}>
          <Text style={[typography.body, { color: colors.danger }]}>Disconnect Server</Text>
          <Text style={typography.bodySmall}>Change server IP address</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    ...shadows.small,
  },
  dangerCard: { borderColor: 'rgba(239,68,68,0.2)' },
  iconWrap: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  cardText: { flex: 1 },
});
