import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, spacing, typography, radius, shadows } from '../../lib/theme';
import { clearServerUrl } from '../../lib/api';

const menuItems = [
  { icon: 'camera-outline', label: 'AI Camera', desc: 'Scan medicine packaging', route: '/camera', color: '#F59E0B' },
  { icon: 'search-outline', label: 'Product Trace', desc: 'Find product across purchases & sales', route: '/product-search', color: colors.accent },
  { icon: 'cloud-upload-outline', label: 'Backup & Safety', desc: 'Create backup, restore data', route: '/backup', color: colors.info },
];

export default function MoreScreen() {
  const router = useRouter();

  const handleDisconnect = async () => {
    await clearServerUrl();
    // Force reload by navigating to root — the root layout will show ServerSetup
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
