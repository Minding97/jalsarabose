import { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ScreenProps = PropsWithChildren<{
  eyebrow: string;
  title: string;
  description?: string;
}>;

export function Screen({ eyebrow, title, description, children }: ScreenProps) {
  const theme = useTheme();

  return (
    <ScrollView style={[styles.scroll, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={[styles.eyebrow, { color: theme.primary }]}>{eyebrow}</Text>
            <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
            {description ? (
              <Text style={[styles.description, { color: theme.textSecondary }]}>
                {description}
              </Text>
            ) : null}
          </View>
          {children}
        </View>
      </SafeAreaView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.five,
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: Spacing.three,
  },
  header: {
    paddingTop: Spacing.three,
    gap: Spacing.one,
  },
  eyebrow: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '900',
  },
  title: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '900',
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
  },
});
