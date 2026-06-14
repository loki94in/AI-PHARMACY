import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from 'expo-router';
import { colors, spacing, typography, radius, shadows } from '../lib/theme';
import { getSavedNotifications, markAllNotificationsAsRead, clearAllNotifications, SavedNotification } from '../lib/api';

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState<SavedNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const navigation = useNavigation();

  const loadNotifications = async () => {
    setLoading(true);
    const data = await getSavedNotifications();
    setNotifications(data);
    setLoading(false);
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  // Update header right button to allow clearing
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerButtons}>
          <TouchableOpacity onPress={handleMarkAllRead} style={styles.headerBtn} activeOpacity={0.7}>
            <Ionicons name="mail-open-outline" size={20} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleClearAll} style={[styles.headerBtn, { marginLeft: spacing.md }]} activeOpacity={0.7}>
            <Ionicons name="trash-outline" size={20} color={colors.danger} />
          </TouchableOpacity>
        </View>
      ),
    });
  }, [notifications, navigation]);

  const handleMarkAllRead = async () => {
    if (notifications.length === 0) return;
    await markAllNotificationsAsRead();
    loadNotifications();
  };

  const handleClearAll = () => {
    if (notifications.length === 0) return;
    Alert.alert(
      'Clear Notifications',
      'Are you sure you want to delete all alert history?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            await clearAllNotifications();
            loadNotifications();
          },
        },
      ]
    );
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const isWarning = 
            item.title.toLowerCase().includes('warning') || 
            item.title.toLowerCase().includes('fail') || 
            item.title.toLowerCase().includes('error');
          const isSuccess = 
            item.title.toLowerCase().includes('success') || 
            item.title.toLowerCase().includes('complete') || 
            item.title.toLowerCase().includes('saved') || 
            item.title.toLowerCase().includes('synced');

          return (
            <View style={[styles.card, !item.read && styles.unreadCard]}>
              {/* Unread indicator dot */}
              {!item.read && (
                <View style={[styles.unreadDot, { backgroundColor: isWarning ? colors.danger : isSuccess ? colors.success : colors.primary }]} />
              )}

              <View style={styles.cardHeader}>
                <Ionicons
                  name={isWarning ? 'warning' : isSuccess ? 'checkmark-circle' : 'notifications'}
                  size={16}
                  color={isWarning ? colors.danger : isSuccess ? colors.success : colors.primary}
                  style={styles.cardIcon}
                />
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.dateText}>{formatDate(item.timestamp)}</Text>
              </View>

              <Text style={styles.bodyText}>{item.body}</Text>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="notifications-off-outline" size={60} color={colors.textMuted} />
            <Text style={[typography.h3, { marginTop: spacing.md, color: colors.textSecondary }]}>
              No Alerts Yet
            </Text>
            <Text style={[typography.bodySmall, { textAlign: 'center', marginTop: spacing.sm, color: colors.textMuted }]}>
              System alerts, billing confirmations, and stock updates will be logged here.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
  },
  headerBtn: {
    padding: 4,
  },
  listContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.small,
  },
  unreadCard: {
    borderColor: 'rgba(108, 99, 255, 0.35)', // slightly glow unread cards
    backgroundColor: 'rgba(108, 99, 255, 0.02)',
  },
  unreadDot: {
    position: 'absolute',
    left: 8,
    top: 18,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
    paddingLeft: 4,
  },
  cardIcon: {
    marginRight: 6,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
  },
  dateText: {
    fontSize: 10,
    color: colors.textMuted,
  },
  bodyText: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
    paddingLeft: 22,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 100,
    paddingHorizontal: spacing.xl,
  },
});
