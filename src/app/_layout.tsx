import { DefaultTheme, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { AppShell } from '@/components/app-shell';
import { QaOverlay } from '@/components/qa-overlay';

export default function TabLayout() {
  useEffect(() => {
    if (Platform.OS !== 'web') {
      void import('@/services/notification-service')
        .then(({ cancelRetiredFeatureNotifications }) => cancelRetiredFeatureNotifications())
        .catch(() => undefined);
    }
  }, []);

  return (
    <ThemeProvider value={DefaultTheme}>
      <StatusBar style="dark" />
      <View style={styles.root}>
        <AppShell />
        <QaOverlay />
      </View>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
