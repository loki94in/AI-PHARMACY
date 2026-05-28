import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, typography, radius, shadows } from '../lib/theme';
import { triggerBackup, clearServerUrl } from '../lib/api';
import Card from '../components/Card';

export default function BackupScreen() {
  const [backingUp, setBackingUp] = useState(false);
  const [lastBackup, setLastBackup] = useState<string | null>(null);

  const handleBackup = async () => {
    setBackingUp(true);
    try {
      const res = await triggerBackup();
      setLastBackup(res.backupFilename);
      Alert.alert('Backup Created', `File: ${res.backupFilename}`);
    } catch (e: any) {
      Alert.alert('Backup Failed', e.message || 'Could not create backup');
    } finally {
      setBackingUp(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Backup Section */}
      <Card style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={[styles.iconWrap, { backgroundColor: 'rgba(59,130,246,0.15)' }]}>
            <Ionicons name="cloud-upload-outline" size={28} color={colors.info} />
          </View>
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Text style={typography.h3}>Database Backup</Text>
            <Text style={typography.bodySmall}>Create a snapshot of your pharmacy database</Text>
          </View>
        </View>

        {lastBackup && (
          <View style={styles.lastBackupRow}>
            <Ionicons name="checkmark-circle" size={16} color={colors.success} />
            <Text style={[typography.bodySmall, { color: colors.success, marginLeft: 6 }]}>Last: {lastBackup}</Text>
          </View>
        )}

        <TouchableOpacity onPress={handleBackup} disabled={backingUp} activeOpacity={0.8} style={{ marginTop: spacing.md }}>
          <LinearGradient colors={[colors.info, '#2563EB']} style={styles.actionBtn}>
            {backingUp ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="download-outline" size={20} color="#fff" />
                <Text style={styles.actionBtnText}>Create Backup Now</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </Card>

      {/* Notifications Info */}
      <Card style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={[styles.iconWrap, { backgroundColor: 'rgba(108,99,255,0.15)' }]}>
            <Ionicons name="notifications-outline" size={28} color={colors.primary} />
          </View>
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Text style={typography.h3}>Notifications</Text>
            <Text style={typography.bodySmall}>Real-time alerts from the server are delivered via WhatsApp and Telegram integrations configured on the PC</Text>
          </View>
        </View>
      </Card>

      {/* Server Info */}
      <Card style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={[styles.iconWrap, { backgroundColor: 'rgba(0,217,166,0.15)' }]}>
            <Ionicons name="server-outline" size={28} color={colors.accent} />
          </View>
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Text style={typography.h3}>Server Connection</Text>
            <Text style={typography.bodySmall}>Connected to your Pharmacy Genius backend. Go to More → Disconnect to change server.</Text>
          </View>
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  section: { marginBottom: spacing.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center' },
  iconWrap: { width: 52, height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  lastBackupRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md, backgroundColor: 'rgba(34,197,94,0.08)', padding: spacing.sm, borderRadius: radius.sm },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: 14, borderRadius: radius.md },
  actionBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
