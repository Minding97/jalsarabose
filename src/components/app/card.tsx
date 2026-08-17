import { PropsWithChildren } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

type CardProps = PropsWithChildren<{
  title?: string;
  style?: StyleProp<ViewStyle>;
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
      {title ? <Text style={[styles.title, { color: theme.text }]}>{title}</Text> : null}
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  title: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
  },
  content: {
    gap: 8,
  },
});
