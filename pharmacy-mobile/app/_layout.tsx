import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';
import { colors } from '../lib/theme';
import { getServerUrl } from '../lib/api';
import ServerSetup from '../components/ServerSetup';

export { ErrorBoundary } from 'expo-router';

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

  useEffect(() => {
    (async () => {
      const url = await getServerUrl();
      setHasServer(!!url);
      setReady(true);
      SplashScreen.hideAsync();
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
