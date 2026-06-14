import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography, shadows } from '../lib/theme';
import { testConnection, setServerUrl } from '../lib/api';
import { LinearGradient } from 'expo-linear-gradient';
import { CameraView, useCameraPermissions } from 'expo-camera';

interface ServerSetupProps {
  onConnected: () => void;
}

export default function ServerSetup({ onConnected }: ServerSetupProps) {
  const [ip, setIp] = useState('');
  const [port, setPort] = useState('3000');
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

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

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    setScanned(true);
    setTesting(true);
    setError('');

    try {
      let targetUrl = '';
      
      // Try parsing the scanned code as JSON containing serverUrls
      try {
        const parsed = JSON.parse(data);
        if (parsed && Array.isArray(parsed.serverUrls)) {
          // Loop over URLs and test connection
          for (const url of parsed.serverUrls) {
            const ok = await testConnection(url);
            if (ok) {
              targetUrl = url;
              break;
            }
          }
        }
      } catch (err) {
        // Scanned raw string/URL instead of JSON
        targetUrl = data.trim();
      }

      if (targetUrl) {
        if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
          targetUrl = `http://${targetUrl}`;
        }
        
        const ok = await testConnection(targetUrl);
        if (ok) {
          await setServerUrl(targetUrl);
          onConnected();
          setTesting(false);
          setShowScanner(false);
          return;
        }
      }

      setError('Cannot connect to scanned server. Check connection.');
    } catch (err) {
      setError('Invalid QR code format.');
    } finally {
      setTesting(false);
      setScanned(false);
    }
  };

  if (showScanner) {
    if (!permission) {
      return (
        <View style={styles.scannerCenter}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      );
    }
    if (!permission.granted) {
      return (
        <View style={styles.scannerCenter}>
          <Ionicons name="camera-outline" size={64} color={colors.textMuted} />
          <Text style={[typography.body, { marginTop: spacing.md, textAlign: 'center' }]}>
            Camera access is required to scan the connection QR code.
          </Text>
          <TouchableOpacity onPress={requestPermission} style={{ marginTop: spacing.lg }}>
            <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.permBtn}>
              <Text style={styles.permBtnText}>Grant Permission</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowScanner(false)} style={{ marginTop: spacing.md }}>
            <Text style={{ color: colors.textMuted, fontSize: 15 }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={StyleSheet.absoluteFill}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
        >
          <View style={styles.scannerOverlay}>
            <View style={styles.scannerFrame} />
            <Text style={styles.scannerHint}>Align QR Code within the frame</Text>
            
            <TouchableOpacity 
              onPress={() => setShowScanner(false)} 
              style={styles.scannerCloseBtn}
              activeOpacity={0.8}
            >
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        </CameraView>
      </View>
    );
  }

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

        <Text style={styles.orText}>OR</Text>

        <TouchableOpacity onPress={() => setShowScanner(true)} activeOpacity={0.8}>
          <LinearGradient
            colors={[colors.accentDark, colors.accent]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.scanButton}
          >
            <Ionicons name="qr-code-outline" size={20} color="#fff" />
            <Text style={styles.buttonText}>Scan Connection QR</Text>
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
  orText: {
    ...typography.caption,
    color: colors.textMuted,
    marginVertical: spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
    minWidth: 200,
  },
  scannerCenter: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  permBtn: {
    paddingVertical: 12,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
  },
  permBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  scannerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scannerFrame: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: radius.md,
    backgroundColor: 'transparent',
  },
  scannerHint: {
    ...typography.bodySmall,
    color: '#fff',
    marginTop: spacing.lg,
    textShadowColor: '#000',
    textShadowRadius: 4,
  },
  scannerCloseBtn: {
    position: 'absolute',
    top: 50,
    right: 25,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
});
