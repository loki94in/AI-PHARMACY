/**
 * ThemeContext — day / night toggle persisted in AsyncStorage.
 *
 * Usage:
 *   // In any component:
 *   const { colors, isDark, toggleTheme } = useTheme();
 *
 * Wrap the root in <ThemeProvider> (done in app/_layout.tsx).
 * Components that use StyleSheet.create() with hardcoded colors stay dark;
 * switch them over to useTheme() whenever you want them to respond.
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';
import { darkColors, lightColors, ColorScheme } from './theme';

const THEME_KEY = 'pharmacy_theme_pref'; // 'dark' | 'light' | 'system'

type ThemePref = 'dark' | 'light' | 'system';

interface ThemeContextValue {
  colors: ColorScheme;
  isDark: boolean;
  pref: ThemePref;
  /** Cycle: dark → light → system → dark */
  toggleTheme: () => void;
  setTheme: (p: ThemePref) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  colors: darkColors,
  isDark: true,
  pref: 'dark',
  toggleTheme: () => {},
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme(); // 'dark' | 'light' | null
  const [pref, setPref] = useState<ThemePref>('dark');
  const [loaded, setLoaded] = useState(false);

  // Load saved preference
  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then(val => {
      if (val === 'light' || val === 'dark' || val === 'system') setPref(val);
      setLoaded(true);
    });
  }, []);

  const setTheme = useCallback((p: ThemePref) => {
    setPref(p);
    AsyncStorage.setItem(THEME_KEY, p);
  }, []);

  const toggleTheme = useCallback(() => {
    setPref(prev => {
      const next = prev === 'dark' ? 'light' : prev === 'light' ? 'system' : 'dark';
      AsyncStorage.setItem(THEME_KEY, next);
      return next;
    });
  }, []);

  // Resolve effective dark/light
  const isDark =
    pref === 'dark' ? true :
    pref === 'light' ? false :
    systemScheme !== 'light'; // system default → dark if unknown

  const resolvedColors = isDark ? darkColors : lightColors;

  if (!loaded) return null; // wait for AsyncStorage before rendering

  return (
    <ThemeContext.Provider value={{ colors: resolvedColors, isDark, pref, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
