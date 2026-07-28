import { PropsWithChildren, ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ScreenProps = PropsWithChildren<{
  eyebrow?: string;
  title?: string;
  description?: string;
  floatingAction?: ReactNode;
  testID?: string;
}>;

export function Screen({
  eyebrow,
  title,
  description,
  floatingAction,
  testID,
  children,
}: ScreenProps) {
  const theme = useTheme();

  return (
    <View style={[styles.stage, { backgroundColor: theme.frameOutside }]}>
      <View style={[styles.frame, { backgroundColor: theme.background }]}>
        <ScrollView
          testID={testID}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          <SafeAreaView style={styles.safeArea}>
            <View style={styles.content}>
              {eyebrow || title || description ? (
                <View style={styles.header}>
                  {eyebrow ? (
                    <Text style={[styles.eyebrow, { color: theme.textSecondary }]}>{eyebrow}</Text>
                  ) : null}
                  {title ? <Text style={[styles.title, { color: theme.text }]}>{title}</Text> : null}
                  {description ? (
                    <Text style={[styles.description, { color: theme.textSecondary }]}>
                      {description}
                    </Text>
                  ) : null}
                </View>
              ) : null}
              {children}
            </View>
          </SafeAreaView>
        </ScrollView>
        {floatingAction ? <View style={styles.floatingAction}>{floatingAction}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    flex: 1,
    alignItems: 'center',
  },
  frame: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    position: 'relative',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.five,
    paddingBottom: BottomTabInset + Spacing.six,
  },
  content: {
    width: '100%',
    gap: Spacing.three,
    paddingTop: Spacing.five,
  },
  header: {
    gap: Spacing.one,
    marginBottom: Spacing.one,
  },
  eyebrow: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  title: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '800',
  },
  description: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '500',
  },
  floatingAction: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    zIndex: 30,
  },
});
