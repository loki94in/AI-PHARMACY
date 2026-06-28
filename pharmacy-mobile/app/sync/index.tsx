import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Clipboard,
  Platform,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, radius, shadows } from '../../lib/theme';
import {
  getSyncStatus,
  getSyncPeers,
  addSyncPeer,
  deleteSyncPeer,
  getSyncJobs,
  getTestAimail,
  pingPeer,
  pushTestAimail,
  getServerUrl,
  SyncStatus,
  SyncPeer,
  SyncJob,
} from '../../lib/api';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function truncateId(id: string) {
  if (!id) return '—';
  return id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-8)}` : id;
}

function extractHost(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function jobStatusColor(status: SyncJob['status']) {
  switch (status) {
    case 'pending':  return colors.warning;
    case 'sent':     return colors.success;
    case 'failed':   return colors.danger;
    case 'received': return colors.info;
    default:         return colors.textMuted;
  }
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[chip.wrap, { borderColor: color + '40' }]}>
      <Text style={[chip.value, { color }]}>{value}</Text>
      <Text style={chip.label}>{label}</Text>
    </View>
  );
}
const chip = StyleSheet.create({
  wrap:  { alignItems: 'center', paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1, backgroundColor: colors.surfaceLight, minWidth: 60 },
  value: { fontSize: 20, fontWeight: '700' },
  label: { fontSize: 10, color: colors.textMuted, fontWeight: '600', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
});

function SectionHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <View style={sec.row}>
      <Ionicons name={icon as any} size={15} color={colors.textMuted} />
      <Text style={[typography.label, { marginLeft: 6 }]}>{title}</Text>
    </View>
  );
}
const sec = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm } });

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function SyncNowScreen() {
  const [status, setStatus]     = useState<SyncStatus | null>(null);
  const [peers, setPeers]       = useState<SyncPeer[]>([]);
  const [jobs, setJobs]         = useState<SyncJob[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Add-peer form
  const [peerIp, setPeerIp]     = useState('');
  const [peerPort, setPeerPort] = useState('3030');
  const [peerLabel, setPeerLabel] = useState('');
  const [addingPeer, setAddingPeer] = useState(false);

  // Test push
  const [pushing, setPushing]   = useState(false);
  const [pushResult, setPushResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Ping per-peer state
  const [pingMap, setPingMap]   = useState<Record<number, 'pinging' | 'ok' | 'fail'>>({});

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [s, p, j] = await Promise.all([getSyncStatus(), getSyncPeers(), getSyncJobs(20)]);
      setStatus(s);
      setPeers(p);
      setJobs(j);
    } catch (err: any) {
      console.warn('[SyncScreen] load error:', err?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ── Add & Verify Peer ──────────────────────────────────────────────────────
  const handleAddPeer = async () => {
    const ip = peerIp.trim();
    const port = parseInt(peerPort.trim(), 10);
    if (!ip) return Alert.alert('Missing IP', 'Enter the peer device IP address.');
    if (isNaN(port) || port < 1 || port > 65535) return Alert.alert('Invalid Port', 'Port must be 1–65535.');

    setAddingPeer(true);
    try {
      // 1. Ping the peer to confirm reachability and get its device_id
      const ping = await pingPeer(ip, port);
      // 2. Register with the backend
      await addSyncPeer(ping.device_id, ip, port, peerLabel.trim() || undefined);
      setPeerIp('');
      setPeerPort('3030');
      setPeerLabel('');
      await load(true);
      Alert.alert('Peer Added', `Connected to ${ip}:${port}\nDevice: ${truncateId(ping.device_id)}`);
    } catch (err: any) {
      Alert.alert('Failed to Add Peer', err?.message ?? 'Could not reach the peer. Check the IP and port, and ensure both devices are on the same Wi-Fi network.');
    } finally {
      setAddingPeer(false);
    }
  };

  // ── Ping existing peer ─────────────────────────────────────────────────────
  const handlePingPeer = async (peer: SyncPeer) => {
    setPingMap(m => ({ ...m, [peer.id]: 'pinging' }));
    try {
      await pingPeer(peer.ip_address, peer.port);
      setPingMap(m => ({ ...m, [peer.id]: 'ok' }));
      setTimeout(() => setPingMap(m => { const n = { ...m }; delete n[peer.id]; return n; }), 3000);
    } catch {
      setPingMap(m => ({ ...m, [peer.id]: 'fail' }));
      setTimeout(() => setPingMap(m => { const n = { ...m }; delete n[peer.id]; return n; }), 3000);
    }
  };

  // ── Delete peer ────────────────────────────────────────────────────────────
  const handleDeletePeer = (peer: SyncPeer) => {
    Alert.alert('Remove Peer', `Remove ${peer.label ?? peer.ip_address} from sync peers?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          try {
            await deleteSyncPeer(peer.id);
            await load(true);
          } catch (err: any) {
            Alert.alert('Error', err?.message ?? 'Failed to remove peer.');
          }
        },
      },
    ]);
  };

  // ── Test Push ──────────────────────────────────────────────────────────────
  const handleTestPush = async () => {
    setPushing(true);
    setPushResult(null);
    try {
      const serverUrl = await getServerUrl();
      if (!serverUrl) throw new Error('Server URL not configured.');

      const host = extractHost(serverUrl);
      if (!host) throw new Error('Could not determine server IP from URL.');

      // 1. Ask backend to build a valid, checksummed test document
      const doc = await getTestAimail();

      // 2. POST directly to the sync worker's HTTP port on the same host
      const result = await pushTestAimail(host, status?.port ?? 3030, doc);

      setPushResult({ ok: true, message: `Delivered to ${host}:${status?.port ?? 3030}  ✓` });
    } catch (err: any) {
      setPushResult({ ok: false, message: err?.message ?? 'Push failed.' });
    } finally {
      setPushing(false);
    }
  };

  // ── Copy device ID ─────────────────────────────────────────────────────────
  const copyDeviceId = () => {
    if (status?.deviceId) {
      Clipboard.setString(status.deviceId);
      Alert.alert('Copied', 'Device ID copied to clipboard.');
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[typography.bodySmall, { marginTop: spacing.md }]}>Loading sync status…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
      keyboardShouldPersistTaps="handled"
    >
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Ionicons name="sync-circle" size={40} color={colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={typography.h2}>Sync Now</Text>
          <Text style={[typography.bodySmall, { marginTop: 2 }]}>
            Push records to peer devices over local Wi-Fi (LAN only)
          </Text>
        </View>
      </View>

      {/* ── Device Status ─────────────────────────────────────────────────── */}
      <View style={styles.card}>
        <SectionHeader icon="hardware-chip-outline" title="This Device" />

        {/* Device ID row */}
        <TouchableOpacity style={styles.idRow} onPress={copyDeviceId} activeOpacity={0.7}>
          <Ionicons name="finger-print-outline" size={16} color={colors.textMuted} />
          <Text style={styles.idText} numberOfLines={1}>{truncateId(status?.deviceId ?? '')}</Text>
          <Ionicons name="copy-outline" size={14} color={colors.textMuted} />
        </TouchableOpacity>

        <View style={styles.portRow}>
          <Ionicons name="wifi-outline" size={14} color={colors.textMuted} />
          <Text style={[typography.bodySmall, { marginLeft: 6 }]}>Sync port  </Text>
          <Text style={[typography.body, { color: colors.accent, fontWeight: '700' }]}>{status?.port ?? 3030}</Text>
        </View>

        {/* Stats grid */}
        <View style={styles.statsRow}>
          <StatChip label="Pending"  value={status?.pending  ?? 0} color={colors.warning} />
          <StatChip label="Sent"     value={status?.sent     ?? 0} color={colors.success} />
          <StatChip label="Failed"   value={status?.failed   ?? 0} color={colors.danger} />
          <StatChip label="Received" value={status?.received ?? 0} color={colors.info} />
        </View>
      </View>

      {/* ── Test Push ─────────────────────────────────────────────────────── */}
      <View style={styles.card}>
        <SectionHeader icon="paper-plane-outline" title="Test Push" />
        <Text style={[typography.bodySmall, { marginBottom: spacing.md }]}>
          Sends a single test .aimail document from this phone directly to the sync
          worker running on the server (same Wi-Fi, port {status?.port ?? 3030}).
          The server builds the document — no manual checksum needed.
        </Text>

        <TouchableOpacity
          style={[styles.primaryBtn, pushing && styles.primaryBtnDisabled]}
          onPress={handleTestPush}
          disabled={pushing}
          activeOpacity={0.8}
        >
          {pushing
            ? <ActivityIndicator size="small" color="#fff" />
            : <Ionicons name="send-outline" size={18} color="#fff" />}
          <Text style={styles.primaryBtnText}>{pushing ? 'Sending…' : 'Send Test .aimail'}</Text>
        </TouchableOpacity>

        {pushResult && (
          <View style={[styles.resultBanner, pushResult.ok ? styles.resultOk : styles.resultFail]}>
            <Ionicons
              name={pushResult.ok ? 'checkmark-circle-outline' : 'alert-circle-outline'}
              size={16}
              color={pushResult.ok ? colors.success : colors.danger}
            />
            <Text style={[styles.resultText, { color: pushResult.ok ? colors.success : colors.danger }]}>
              {pushResult.message}
            </Text>
          </View>
        )}
      </View>

      {/* ── Peers ─────────────────────────────────────────────────────────── */}
      <View style={styles.card}>
        <SectionHeader icon="people-outline" title={`Known Peers (${peers.length})`} />

        {peers.length === 0 && (
          <Text style={[typography.bodySmall, { marginBottom: spacing.md }]}>
            No peers registered yet. Add a device below to start syncing.
          </Text>
        )}

        {peers.map(peer => {
          const pingState = pingMap[peer.id];
          return (
            <View key={peer.id} style={styles.peerRow}>
              <View style={styles.peerInfo}>
                <Text style={typography.body} numberOfLines={1}>
                  {peer.label ?? peer.ip_address}
                </Text>
                <Text style={typography.bodySmall}>
                  {peer.ip_address}:{peer.port}
                  {peer.last_seen ? `  ·  seen ${timeAgo(peer.last_seen)}` : ''}
                </Text>
              </View>

              {/* Ping button */}
              <TouchableOpacity
                style={[styles.pingBtn, pingState === 'ok' && styles.pingOk, pingState === 'fail' && styles.pingFail]}
                onPress={() => handlePingPeer(peer)}
                disabled={pingState === 'pinging'}
              >
                {pingState === 'pinging'
                  ? <ActivityIndicator size="small" color={colors.textMuted} />
                  : <Ionicons
                      name={pingState === 'ok' ? 'checkmark' : pingState === 'fail' ? 'close' : 'radio-outline'}
                      size={14}
                      color={pingState === 'ok' ? colors.success : pingState === 'fail' ? colors.danger : colors.textMuted}
                    />
                }
                <Text style={[styles.pingText,
                  pingState === 'ok'   && { color: colors.success },
                  pingState === 'fail' && { color: colors.danger },
                ]}>
                  {pingState === 'ok' ? 'OK' : pingState === 'fail' ? 'Fail' : 'Ping'}
                </Text>
              </TouchableOpacity>

              {/* Delete */}
              <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeletePeer(peer)}>
                <Ionicons name="trash-outline" size={18} color={colors.danger} />
              </TouchableOpacity>
            </View>
          );
        })}

        {/* Add Peer Form */}
        <View style={styles.addPeerForm}>
          <Text style={[typography.label, { marginBottom: spacing.sm }]}>ADD PEER</Text>

          <TextInput
            style={styles.input}
            value={peerIp}
            onChangeText={setPeerIp}
            placeholder="IP address  e.g. 192.168.1.50"
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={styles.addRow}>
            <TextInput
              style={[styles.input, { flex: 1, marginRight: spacing.sm }]}
              value={peerPort}
              onChangeText={setPeerPort}
              placeholder="Port"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
            />
            <TextInput
              style={[styles.input, { flex: 2 }]}
              value={peerLabel}
              onChangeText={setPeerLabel}
              placeholder="Label (optional)"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="words"
            />
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, addingPeer && styles.primaryBtnDisabled]}
            onPress={handleAddPeer}
            disabled={addingPeer}
            activeOpacity={0.8}
          >
            {addingPeer
              ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name="add-circle-outline" size={18} color="#fff" />}
            <Text style={styles.primaryBtnText}>{addingPeer ? 'Verifying…' : 'Add & Verify Peer'}</Text>
          </TouchableOpacity>
          <Text style={[typography.caption, { marginTop: spacing.sm, textAlign: 'center' }]}>
            Pings the peer first to confirm reachability before saving.
          </Text>
        </View>
      </View>

      {/* ── Recent Jobs ───────────────────────────────────────────────────── */}
      <View style={[styles.card, { marginBottom: spacing.xl }]}>
        <SectionHeader icon="list-outline" title={`Recent Jobs (last ${jobs.length})`} />

        {jobs.length === 0 && (
          <Text style={typography.bodySmall}>No sync jobs yet.</Text>
        )}

        {jobs.map((job, i) => (
          <View key={job.job_id} style={[styles.jobRow, i < jobs.length - 1 && styles.jobBorder]}>
            {/* Direction badge */}
            <View style={[styles.dirBadge, job.direction === 'outbound' ? styles.dirOut : styles.dirIn]}>
              <Ionicons
                name={job.direction === 'outbound' ? 'arrow-up-outline' : 'arrow-down-outline'}
                size={12}
                color={job.direction === 'outbound' ? colors.accent : colors.info}
              />
            </View>

            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <Text style={[typography.bodySmall, { color: colors.textPrimary, fontWeight: '600' }]} numberOfLines={1}>
                {job.entity_type}  ·  {job.entity_id.slice(0, 8)}…
              </Text>
              {job.error && (
                <Text style={[typography.caption, { color: colors.danger }]} numberOfLines={1}>
                  {job.error}
                </Text>
              )}
              <Text style={typography.caption}>{timeAgo(job.created_at)}</Text>
            </View>

            {/* Status chip */}
            <View style={[styles.statusChip, { borderColor: jobStatusColor(job.status) + '60' }]}>
              <Text style={[styles.statusText, { color: jobStatusColor(job.status) }]}>
                {job.status}
              </Text>
            </View>

            {/* Retry count */}
            {job.retries > 0 && (
              <Text style={[typography.caption, { marginLeft: spacing.sm, color: colors.warning }]}>
                ×{job.retries}
              </Text>
            )}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, paddingTop: spacing.lg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },

  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  heroIcon: {
    width: 60,
    height: 60,
    borderRadius: radius.lg,
    backgroundColor: colors.accent + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    ...shadows.card,
  },

  idRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surfaceLight,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  idText: {
    flex: 1,
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: colors.textPrimary,
  },
  portRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },

  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
  },
  primaryBtnDisabled: { opacity: 0.55 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  resultBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.sm,
  },
  resultOk:   { backgroundColor: colors.success + '15' },
  resultFail: { backgroundColor: colors.danger  + '15' },
  resultText: { flex: 1, fontSize: 13, fontWeight: '600' },

  peerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderColor: colors.divider,
    gap: spacing.sm,
  },
  peerInfo: { flex: 1 },

  pingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surfaceLight,
  },
  pingOk:   { borderColor: colors.success + '60' },
  pingFail: { borderColor: colors.danger  + '60' },
  pingText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },

  deleteBtn: { padding: 6 },

  addPeerForm: {
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderColor: colors.divider,
    paddingTop: spacing.md,
  },
  input: {
    backgroundColor: colors.surfaceLight,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    color: colors.textPrimary,
    fontSize: 14,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  addRow: { flexDirection: 'row', marginBottom: spacing.sm },

  jobRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  jobBorder: { borderBottomWidth: 1, borderColor: colors.divider },

  dirBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dirOut: { backgroundColor: colors.accent + '18' },
  dirIn:  { backgroundColor: colors.info   + '18' },

  statusChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
    borderWidth: 1,
    marginLeft: spacing.sm,
  },
  statusText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
});
