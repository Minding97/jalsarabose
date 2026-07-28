import { StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type EmptyStateProps = {
  title: string;
  description?: string;
};

export function EmptyState({ title, description }: EmptyStateProps) {
  const theme = useTheme();

  return (
    <View style={[styles.wrapper, { borderColor: theme.border }]}>
      <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      {description ? (
        <Text style={[styles.description, { color: theme.textSecondary }]}>{description}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderWidth: 0,
    paddingVertical: Spacing.six,
    paddingHorizontal: Spacing.three,
    gap: Spacing.one,
    alignItems: 'center',
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    textAlign: 'center',
  },
});
