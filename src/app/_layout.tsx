import { DefaultTheme, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { AppShell } from '@/components/app-shell';

export default function TabLayout() {
  useEffect(() => {
    if (Platform.OS !== 'web') {
      void import('@/services/notification-service');
    }
  }, []);

  return (
    <ThemeProvider value={DefaultTheme}>
      <StatusBar style="dark" />
      <AppShell />
    </ThemeProvider>
  );
}
