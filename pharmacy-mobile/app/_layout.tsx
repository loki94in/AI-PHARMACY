import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { ThemeProvider as PharmacyThemeProvider } from '../lib/ThemeContext';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Platform, Animated, TouchableOpacity } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as SecureStore from '../lib/secureStore';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import 'react-native-reanimated';
import { colors } from '../lib/theme';
import { getServerUrl, testConnection, getOfflineSalesQueue, getOfflinePurchasesQueue, getOfflineStockQueue, syncOfflineSalesAndRefresh, registerPushToken, saveNotification, getMobileAutomationTasks, retryMobileFallbackTask, autoDiscoverServer, warmInventoryCache, getInventoryCacheAge } from '../lib/api';
import ServerSetup from '../components/ServerSetup';
import AppLock from '../components/AppLock';
import { ConnectionContext, ConnectionState } from '../lib/ConnectionContext';

export { ErrorBoundary } from 'expo-router';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

const PharmacyDark = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.surface,
    text: colors.textPrimary,
    border: colors.divider,
    primary: colors.primary,
  },
};

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [hasServer, setHasServer] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  const [fontsLoaded, fontError] = useFonts({
    ...Ionicons.font,
  });

  const initRef = useRef(false);

  const [isServerOnline, setIsServerOnline] = useState(true);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [syncingOffline, setSyncingOffline] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [activeServerUrl, setActiveServerUrl] = useState('');
  const pushTokenRegisteredRef = useRef(false); // register only once per session

  // Toast Notification State & Animated Values
  const [toast, setToast] = useState<{ title: string; body: string } | null>(null);
  const slideAnim = useRef(new Animated.Value(-350)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Refs for tracking registered device information for periodic server pings
  const deviceTokenRef = useRef<string | null>(null);
  const deviceNameRef = useRef<string>('Device');
  const deviceOsRef = useRef<string>(Platform.OS);

  const showToast = (title: string, body: string) => {
    setToast({ title, body });
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 16, // Left offset position
        useNativeDriver: true,
        bounciness: 6,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      })
    ]).start();

    // Auto-hide after 4.5 seconds
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -350,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        })
      ]).start(() => {
        setToast(null);
      });
    }, 4500);
  };

  // Toast and Notification History hook
  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener(async (notification) => {
      const { title, body } = notification.request.content;
      if (title && body) {
        // Save to local storage history list
        await saveNotification(title, body);
        // Show left-side toast popup
        showToast(title, body);
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // ─── Main background loop — 60 s ──────────────────────────────────────────
  // Handles: connection test, offline sync, inventory cache warm.
  // registerPushToken is NOT here — it runs once on startup (see init useEffect).
  // getMobileAutomationTasks has its own slower 120 s loop below.
  useEffect(() => {
    let syncingRef = false;

    const checkConnectionAndSync = async () => {
      const url = await getServerUrl();
      if (!url) return;

      let online = await testConnection(url);
      if (!online) {
        // IP may have changed — attempt auto-discover before giving up
        const discovered = await autoDiscoverServer();
        if (discovered) online = true;
      }
      setIsServerOnline(online);
      setActiveServerUrl(online ? url : '');

      // Read queue sizes from AsyncStorage (local — no API call)
      const salesQueue = await getOfflineSalesQueue();
      const purchasesQueue = await getOfflinePurchasesQueue();
      const stockQueue = await getOfflineStockQueue();
      const totalPending = salesQueue.length + purchasesQueue.length + stockQueue.length;
      setPendingSyncCount(totalPending);

      if (online && totalPending > 0 && !syncingRef) {
        syncingRef = true;
        setSyncingOffline(true);
        try {
          const res = await syncOfflineSalesAndRefresh();
          console.log(`Synced ${res.syncedCount} offline item(s).`);
          const s = await getOfflineSalesQueue();
          const p = await getOfflinePurchasesQueue();
          const k = await getOfflineStockQueue();
          setPendingSyncCount(s.length + p.length + k.length);
          setLastSyncTime(new Date());
        } catch (syncErr) {
          console.warn('Background sync failed:', syncErr);
        } finally {
          syncingRef = false;
          setSyncingOffline(false);
        }
      }

      // Warm inventory cache if stale (> 5 min) — fire-and-forget
      if (online) {
        const cacheAgeMs = await getInventoryCacheAge();
        if (cacheAgeMs > 5 * 60 * 1000) {
          warmInventoryCache().catch(() => {});
        }
      }
    };

    checkConnectionAndSync();
    const mainId = setInterval(checkConnectionAndSync, 60_000); // 60 s — was 15 s
    return () => clearInterval(mainId);
  }, []);

  // ─── Automation-task retry loop — 120 s ───────────────────────────────────
  // Runs independently so it doesn't inflate the main loop frequency.
  useEffect(() => {
    const retryAutomationTasks = async () => {
      const url = await getServerUrl();
      if (!url) return;
      const online = await testConnection(url);
      if (!online) return;
      try {
        const tasks = await getMobileAutomationTasks();
        for (const task of tasks.filter(t => t.status === 'failed')) {
          await retryMobileFallbackTask(task.id);
        }
      } catch (err) {
        console.warn('Automation task retry failed:', err);
      }
    };

    retryAutomationTasks();
    const autoId = setInterval(retryAutomationTasks, 120_000); // 120 s — was 15 s
    return () => clearInterval(autoId);
  }, []);

  useEffect(() => {
    if ((fontsLoaded || fontError) && !initRef.current) {
      initRef.current = true;
      (async () => {
        // Try to automatically discover the server (checks cache first, then scans WiFi)
        const url = await autoDiscoverServer();
        setHasServer(!!url);
        // Warm inventory cache on first launch so offline sales have real pricing
        if (url) warmInventoryCache().catch(() => {});

        // Check if App Lock is enabled
        const lockEnabled = await SecureStore.getItemAsync('app_lock_enabled');
        if (lockEnabled === 'true') {
          setIsLocked(true);
        }

        setReady(true);
        try {
          await SplashScreen.hideAsync();
        } catch (err) {
          console.warn('Failed to hide splash screen:', err);
        }
      })();

      // Push notification setup & permissions request
      (async () => {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        if (finalStatus !== 'granted') {
          console.warn('Push notification permissions denied.');
          return;
        }

        // Fetch Expo Push Token and register it to the backend
        try {
          const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
          let token = '';

          if (projectId) {
            try {
              const tokenData = await Notifications.getExpoPushTokenAsync({
                projectId,
              });
              token = tokenData.data;
            } catch (tokenErr) {
              console.log('Could not fetch Expo push token, using fallback device ID:', tokenErr);
            }
          }

          if (!token) {
            // Fallback to local device UUID if push notifications or projectId is unavailable
            let deviceUuid = await SecureStore.getItemAsync('admin_device_uuid');
            if (!deviceUuid) {
              deviceUuid = 'DEV-' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
              await SecureStore.setItemAsync('admin_device_uuid', deviceUuid);
            }
            token = deviceUuid;
          }

          const deviceName = Constants.deviceName || (Platform.OS === 'ios' ? 'iPhone' : Platform.OS === 'android' ? 'Android' : 'Device');
          const os = Platform.OS;

          deviceTokenRef.current = token;
          deviceNameRef.current = deviceName;
          deviceOsRef.current = os;

          // Register once on startup — NOT on every polling interval
          if (!pushTokenRegisteredRef.current) {
            await registerPushToken(token, deviceName, os);
            pushTokenRegisteredRef.current = true;
            console.log('Device registered. ID:', token);
          }
        } catch (tokenErr) {
          console.log('Failed to register device connection status:', tokenErr);
        }

        // Establish real-time notifications listener via SSE (XHR style)
        const url = await getServerUrl();
        if (!url) return;
        
        const xhr = new XMLHttpRequest();
        xhr.open('GET', `${url}/api/notifications/stream`, true);
        let seenBytes = 0;
        
        xhr.onreadystatechange = () => {
          if (xhr.readyState === 3 || xhr.readyState === 4) {
            const newData = xhr.responseText.substring(seenBytes);
            seenBytes = xhr.responseText.length;
            
            const lines = newData.split('\n');
            for (const line of lines) {
              if (line.trim().startsWith('data:')) {
                try {
                  const jsonStr = line.replace(/^\s*data:\s*/, '').trim();
                  const json = JSON.parse(jsonStr);
                  if (json.type === 'connected') {
                    Notifications.scheduleNotificationAsync({
                      content: {
                        title: 'System Connected 🚀',
                        body: json.message || 'Notification stream active.',
                      },
                      trigger: null,
                    });
                  }
                } catch (e) {
                  // Ignore parse errors on partial chunks
                }
              }
            }
          }
        };
        xhr.onerror = () => {
          console.warn('Notification stream connection error.');
        };
        xhr.send();
      })();
    }
  }, [fontsLoaded, fontError]);

  if (!ready || (!fontsLoaded && !fontError)) return null;

  if (!hasServer) {
    return (
      <>
        <StatusBar style="light" />
        <ServerSetup onConnected={() => setHasServer(true)} />
      </>
    );
  }

  if (isLocked) {
    return (
      <>
        <StatusBar style="light" />
        <AppLock onUnlock={() => setIsLocked(false)} />
      </>
    );
  }

  const connectionValue: ConnectionState = {
    isOnline: isServerOnline,
    pendingSyncCount,
    lastSyncTime,
    syncingOffline,
    serverUrl: activeServerUrl,
  };

  return (
    <PharmacyThemeProvider>
    <ConnectionContext.Provider value={connectionValue}>
    <ThemeProvider value={PharmacyDark}>
      <StatusBar style="light" />
      
      {/* Sync Status Banner */}
      {(!isServerOnline || pendingSyncCount > 0) && (
        <View style={[
          styles.syncBanner,
          !isServerOnline ? styles.offlineBanner : styles.syncingBanner
        ]}>
          <Text style={styles.syncBannerText}>
            {!isServerOnline 
              ? `🔌 Server Offline (Local mode) ${pendingSyncCount > 0 ? `| ${pendingSyncCount} pending sale(s)` : ''}`
              : syncingOffline 
                ? `🔄 Syncing ${pendingSyncCount} offline sale(s)...`
                : `⚡ Connection Restored! Syncing...`
            }
          </Text>
        </View>
      )}

      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="camera/index" options={{ title: 'AI Camera', headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.textPrimary }} />
        <Stack.Screen name="product-search/index" options={{ title: 'Product Trace', headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.textPrimary }} />
        <Stack.Screen name="backup/index" options={{ title: 'Backup & Safety', headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.textPrimary }} />
        <Stack.Screen name="notifications/index" options={{ title: 'System Alerts', headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.textPrimary }} />
      </Stack>

      {/* Global Left-Aligned Toast Alert */}
      {toast && (
        <Animated.View
          style={[
            styles.toastContainer,
            {
              transform: [{ translateX: slideAnim }],
              opacity: fadeAnim,
            },
          ]}
        >
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => {
              Animated.parallel([
                Animated.timing(slideAnim, {
                  toValue: -350,
                  duration: 200,
                  useNativeDriver: true,
                }),
                Animated.timing(fadeAnim, {
                  toValue: 0,
                  duration: 150,
                  useNativeDriver: true,
                }),
              ]).start(() => {
                setToast(null);
              });
            }}
            style={styles.toastContent}
          >
            <View style={styles.toastHeaderRow}>
              <Ionicons
                name={
                  toast.title.toLowerCase().includes('whatsapp') || toast.title.toLowerCase().includes('warning') || toast.title.toLowerCase().includes('fail')
                    ? 'warning'
                    : toast.title.toLowerCase().includes('save') || toast.title.toLowerCase().includes('bill') || toast.title.toLowerCase().includes('sync')
                    ? 'receipt'
                    : toast.title.toLowerCase().includes('connected') || toast.title.toLowerCase().includes('restored')
                    ? 'wifi'
                    : 'mail-unread'
                }
                size={15}
                color={
                  toast.title.toLowerCase().includes('warning') || toast.title.toLowerCase().includes('failed') || toast.title.toLowerCase().includes('error')
                    ? colors.danger
                    : toast.title.toLowerCase().includes('connected') || toast.title.toLowerCase().includes('saved') || toast.title.toLowerCase().includes('complete') || toast.title.toLowerCase().includes('success')
                    ? colors.accent
                    : colors.primary
                }
              />
              <Text style={styles.toastTitleText} numberOfLines={1}>
                {toast.title}
              </Text>
            </View>
            <Text style={styles.toastBodyText} numberOfLines={2}>
              {toast.body}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </ThemeProvider>
    </ConnectionContext.Provider>
    </PharmacyThemeProvider>
  );
}

const styles = StyleSheet.create({
  syncBanner: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  offlineBanner: {
    backgroundColor: '#EF4444', // Danger red
  },
  syncingBanner: {
    backgroundColor: '#F59E0B', // Warning amber
  },
  syncBannerText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  toastContainer: {
    position: 'absolute',
    left: 0,
    top: Platform.OS === 'ios' ? 95 : 75,
    width: 290,
    zIndex: 9999,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: 'rgba(26, 26, 46, 0.95)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 10,
    overflow: 'hidden',
  },
  toastContent: {
    padding: 12,
  },
  toastHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 6,
  },
  toastTitleText: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: '#fff',
  },
  toastBodyText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.8)',
    lineHeight: 16,
  },
});
