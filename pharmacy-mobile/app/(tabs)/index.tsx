import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, spacing, typography, radius, shadows } from '../../lib/theme';
import { getDashboard, getReportsSummary } from '../../lib/api';
import StatCard from '../../components/StatCard';
import Card from '../../components/Card';

export default function DashboardScreen() {
  const router = useRouter();
  const [data, setData] = useState({ todaySales: 0, lowStock: 0, pendingTasks: 0 });
  const [reports, setReports] = useState({ totalSales: 0, totalPurchases: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [dash, rep] = await Promise.all([getDashboard(), getReportsSummary()]);
      setData(dash);
      setReports(rep);
    } catch (e) {
      console.warn('Dashboard fetch error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = () => { setRefreshing(true); fetchData(); };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={typography.caption}>PHARMACY GENIUS</Text>
          <Text style={typography.h1}>Dashboard</Text>
        </View>
        <TouchableOpacity style={styles.settingsBtn} onPress={() => router.push('/backup')}>
          <Ionicons name="settings-outline" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Stat Cards */}
      <View style={styles.statsRow}>
        <StatCard
          title="Today's Sales"
          value={`₹${Number(data.todaySales).toLocaleString('en-IN')}`}
          icon={<Ionicons name="trending-up" size={20} color="#fff" />}
          gradient={[colors.primary, '#4A42E0']}
        />
        <View style={{ width: spacing.md }} />
        <StatCard
          title="Low Stock"
          value={data.lowStock}
          icon={<Ionicons name="warning-outline" size={20} color="#fff" />}
          gradient={['#F59E0B', '#D97706']}
        />
      </View>

      {/* Overall Stats */}
      <Card style={styles.overallCard}>
        <Text style={typography.label}>LIFETIME OVERVIEW</Text>
        <View style={styles.overallRow}>
          <View style={styles.overallItem}>
            <Ionicons name="arrow-up-circle" size={24} color={colors.success} />
            <Text style={styles.overallValue}>₹{Number(reports.totalSales).toLocaleString('en-IN')}</Text>
            <Text style={styles.overallLabel}>Total Sales</Text>
          </View>
          <View style={[styles.overallDivider]} />
          <View style={styles.overallItem}>
            <Ionicons name="arrow-down-circle" size={24} color={colors.info} />
            <Text style={styles.overallValue}>₹{Number(reports.totalPurchases).toLocaleString('en-IN')}</Text>
            <Text style={styles.overallLabel}>Total Purchases</Text>
          </View>
        </View>
      </Card>

      {/* Quick Actions */}
      <Text style={[typography.label, { marginTop: spacing.lg, marginBottom: spacing.md }]}>QUICK ACTIONS</Text>
      <View style={styles.actionsGrid}>
        {[
          { icon: 'cart', label: 'New Bill', color: colors.primary, route: '/(tabs)/billing' },
          { icon: 'search', label: 'Find Product', color: colors.accent, route: '/product-search' },
          { icon: 'camera', label: 'AI Camera', color: '#F59E0B', route: '/camera' },
          { icon: 'cloud-upload', label: 'Backup', color: colors.info, route: '/backup' },
        ].map((item, i) => (
          <TouchableOpacity
            key={i}
            style={styles.actionCard}
            activeOpacity={0.7}
            onPress={() => router.push(item.route as any)}
          >
            <View style={[styles.actionIcon, { backgroundColor: item.color + '20' }]}>
              <Ionicons name={item.icon as any} size={24} color={item.color} />
            </View>
            <Text style={styles.actionLabel}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  settingsBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceLight, alignItems: 'center', justifyContent: 'center' },
  statsRow: { flexDirection: 'row', marginBottom: spacing.md },
  overallCard: { marginTop: spacing.sm },
  overallRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', marginTop: spacing.md },
  overallItem: { alignItems: 'center', flex: 1 },
  overallValue: { ...typography.h3, marginTop: 6 },
  overallLabel: { ...typography.caption, marginTop: 2 },
  overallDivider: { width: 1, height: 50, backgroundColor: colors.divider },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  actionCard: {
    width: '47%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    ...shadows.small,
  },
  actionIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  actionLabel: { ...typography.body, fontWeight: '600' },
});
