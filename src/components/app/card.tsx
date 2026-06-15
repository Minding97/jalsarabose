import { PropsWithChildren } from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type CardProps = PropsWithChildren<{
  title: string;
  style?: ViewStyle;
}>;

export function Card({ title, children, style }: CardProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        style,
      ]}>
      <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 8,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  title: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '800',
  },
  content: {
    gap: Spacing.two,
  },
});
