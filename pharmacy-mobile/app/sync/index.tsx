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
  Switch,
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
  setServerUrl,
  setUsbMode,
  getUsbMode,
  SyncStatus,
  SyncPeer,
  SyncJob,
} from '../../lib/api';
import { discoverPharmacyServers, type DiscoveredServer } from '../../lib/mdnsDiscovery';
import { syncViaBle } from '../../lib/bleSync';

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

  // ── Transport alternatives ─────────────────────────────────────────────────
  // mDNS discovery
  const [discovering, setDiscovering]             = useState(false);
  const [discoveredServers, setDiscoveredServers] = useState<DiscoveredServer[]>([]);
  const mdnsStopRef                               = useRef<(() => void) | null>(null);

  // BLE sync
  const [bleSyncing, setBleSyncing]     = useState(false);
  const [bleProgress, setBleProgress]   = useState('');
  const [bleResult, setBleResult]       = useState<{ ok: boolean; msg: string } | null>(null);

  // USB mode
  const [usbMode, setUsbModeState]      = useState(false);
  const [adbRunning, setAdbRunning]     = useState(false);

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

  useFocusEffect(useCallback(() => {
    load();
    // Restore USB mode state
    getUsbMode().then(setUsbModeState).catch(() => {});
  }, [load]));

  // ── mDNS discovery ─────────────────────────────────────────────────────────
  const handleDiscoverMdns = () => {
    if (discovering) {
      mdnsStopRef.current?.();
      setDiscovering(false);
      return;
    }
    setDiscoveredServers([]);
    setDiscovering(true);
    const stop = discoverPharmacyServers((servers) => setDiscoveredServers([...servers]), 10000);
    mdnsStopRef.current = stop;
    setTimeout(() => { setDiscovering(false); mdnsStopRef.current = null; }, 11000);
  };

  const handleConnectDiscovered = async (server: DiscoveredServer) => {
    const url = `http://${server.host}:3000`;
    Alert.alert(
      'Connect to Server',
      `Set server URL to ${url}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Connect',
          onPress: async () => {
            await setServerUrl(url);
            await load(true);
            Alert.alert('Connected', `Server URL set to ${url}`);
          },
        },
      ]
    );
  };

  // ── BLE sync ───────────────────────────────────────────────────────────────
  const handleBleSync = async () => {
    if (bleSyncing) return;
    setBleSyncing(true);
    setBleProgress('');
    setBleResult(null);
    try {
      const serverUrl = await getServerUrl();
      if (!serverUrl) throw new Error('Server URL not configured');
      const doc = await getTestAimail();
      const ok = await syncViaBle(
        JSON.stringify(doc),
        (msg) => setBleProgress(msg)
      );
      setBleResult({ ok, msg: ok ? 'BLE sync delivered successfully.' : bleProgress || 'BLE sync failed.' });
    } catch (err: any) {
      setBleResult({ ok: false, msg: err.message ?? 'BLE sync error.' });
    } finally {
      setBleSyncing(false);
    }
  };

  // ── USB mode ───────────────────────────────────────────────────────────────
  const handleToggleUsb = async (value: boolean) => {
    await setUsbMode(value);
    setUsbModeState(value);
    if (value) {
      Alert.alert(
        'USB Mode Enabled',
        'The app will now connect via http://localhost:3000.\nMake sure "Run ADB Reverse" was pressed on the PC\'s Settings page first, and USB debugging is enabled on this device.',
      );
    }
  };

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

      {/* ── Transport Alternatives ────────────────────────────────────────── */}
      <View style={styles.card}>
        <SectionHeader icon="git-network-outline" title="Transport Alternatives" />
        <Text style={[typography.bodySmall, { marginBottom: spacing.md }]}>
          Fallback transports when Wi-Fi is unavailable or the server IP is unknown.
          Each delivers to the same sync engine on the PC — no data format changes.
        </Text>

        {/* ── mDNS Auto-Discovery ──────────────────────────────────────────── */}
        <View style={tStyles.section}>
          <View style={tStyles.header}>
            <Ionicons name="radio-outline" size={16} color={colors.info} />
            <Text style={[typography.label, { marginLeft: 6, color: colors.info }]}>mDNS AUTO-DISCOVER</Text>
          </View>
          <Text style={[typography.bodySmall, { marginBottom: spacing.sm }]}>
            Scans LAN for AI-Pharmacy desktop without manual IP entry.
            Requires custom dev client (not Expo Go) and react-native-zeroconf.
          </Text>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.info }, discovering && styles.primaryBtnDisabled]}
            onPress={handleDiscoverMdns}
            activeOpacity={0.8}
          >
            {discovering
              ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name="search-outline" size={16} color="#fff" />}
            <Text style={styles.primaryBtnText}>{discovering ? 'Scanning… (tap to stop)' : 'Discover via mDNS'}</Text>
          </TouchableOpacity>

          {discoveredServers.length > 0 && (
            <View style={{ marginTop: spacing.sm }}>
              {discoveredServers.map((s, i) => (
                <TouchableOpacity
                  key={i}
                  style={tStyles.discoveredRow}
                  onPress={() => handleConnectDiscovered(s)}
                  activeOpacity={0.75}
                >
                  <Ionicons name="desktop-outline" size={16} color={colors.accent} />
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={[typography.body, { fontSize: 13 }]}>{s.name}</Text>
                    <Text style={typography.bodySmall}>{s.host}:{s.port}</Text>
                  </View>
                  <Text style={[typography.bodySmall, { color: colors.accent }]}>Use</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {discovering && discoveredServers.length === 0 && (
            <Text style={[typography.caption, { marginTop: spacing.sm, color: colors.textMuted }]}>
              No servers found yet…
            </Text>
          )}
        </View>

        {/* ── BLE Sync ─────────────────────────────────────────────────────── */}
        <View style={[tStyles.section, { marginTop: spacing.md }]}>
          <View style={tStyles.header}>
            <Ionicons name="bluetooth-outline" size={16} color="#A855F7" />
            <Text style={[typography.label, { marginLeft: 6, color: '#A855F7' }]}>BLUETOOTH SYNC</Text>
          </View>
          <Text style={[typography.bodySmall, { marginBottom: spacing.sm }]}>
            Pushes a test AIMAIL document to the desktop via BLE GATT when there is no
            Wi-Fi. Requires custom dev client + @abandonware/bleno on the PC.
          </Text>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: '#A855F7' }, bleSyncing && styles.primaryBtnDisabled]}
            onPress={handleBleSync}
            disabled={bleSyncing}
            activeOpacity={0.8}
          >
            {bleSyncing
              ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name="bluetooth-outline" size={16} color="#fff" />}
            <Text style={styles.primaryBtnText}>
              {bleSyncing ? (bleProgress || 'Connecting…') : 'Sync via BLE'}
            </Text>
          </TouchableOpacity>
          {bleResult && (
            <View style={[styles.resultBanner, bleResult.ok ? styles.resultOk : styles.resultFail]}>
              <Ionicons
                name={bleResult.ok ? 'checkmark-circle-outline' : 'alert-circle-outline'}
                size={16}
                color={bleResult.ok ? colors.success : colors.danger}
              />
              <Text style={[styles.resultText, { color: bleResult.ok ? colors.success : colors.danger }]}>
                {bleResult.msg}
              </Text>
            </View>
          )}
        </View>

        {/* ── USB Mode ─────────────────────────────────────────────────────── */}
        <View style={[tStyles.section, { marginTop: spacing.md }]}>
          <View style={tStyles.header}>
            <Ionicons name="hardware-chip-outline" size={16} color={colors.warning} />
            <Text style={[typography.label, { marginLeft: 6, color: colors.warning }]}>USB CABLE MODE</Text>
          </View>
          <Text style={[typography.bodySmall, { marginBottom: spacing.sm }]}>
            Connect via USB cable with ADB reverse tunnelling. Works in Expo Go — no
            custom dev client required. Run "ADB Reverse" in PC Settings first.
          </Text>
          <View style={tStyles.usbRow}>
            <View style={{ flex: 1 }}>
              <Text style={typography.body}>USB Mode</Text>
              <Text style={typography.bodySmall}>
                {usbMode ? 'Active — connecting via localhost:3000' : 'Inactive — using Wi-Fi server URL'}
              </Text>
            </View>
            <Switch
              value={usbMode}
              onValueChange={handleToggleUsb}
              trackColor={{ false: colors.divider, true: colors.warning }}
              thumbColor={usbMode ? '#fff' : '#f4f3f4'}
            />
          </View>
        </View>
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

const tStyles = StyleSheet.create({
  section: {
    borderTopWidth: 1,
    borderColor: colors.divider,
    paddingTop: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  discoveredRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  usbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: radius.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
});
