import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import 'react-native-reanimated';
import { colors } from '../lib/theme';
import { getServerUrl } from '../lib/api';
import ServerSetup from '../components/ServerSetup';
import AppLock from '../components/AppLock';

export { ErrorBoundary } from 'expo-router';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
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

  useEffect(() => {
    (async () => {
      const url = await getServerUrl();
      setHasServer(!!url);

      // Check if App Lock is enabled
      const lockEnabled = await SecureStore.getItemAsync('app_lock_enabled');
      if (lockEnabled === 'true') {
        setIsLocked(true);
      }

      setReady(true);
      SplashScreen.hideAsync();
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
  }, []);

  if (!ready) return null;

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

  return (
    <ThemeProvider value={PharmacyDark}>
      <StatusBar style="light" />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="camera" options={{ title: 'AI Camera', headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.textPrimary }} />
        <Stack.Screen name="product-search" options={{ title: 'Product Trace', headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.textPrimary }} />
        <Stack.Screen name="backup" options={{ title: 'Backup & Safety', headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.textPrimary }} />
      </Stack>
    </ThemeProvider>
  );
}
