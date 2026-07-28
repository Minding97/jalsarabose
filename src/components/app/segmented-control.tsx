import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type SegmentedControlProps<T extends string> = {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  accessibilityLabel?: string;
  testID?: string;
};

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  accessibilityLabel,
  testID,
}: SegmentedControlProps<T>) {
  const theme = useTheme();

  return (
    <View
      testID={testID ?? 'segmented-control'}
      accessibilityLabel={accessibilityLabel}
      style={[styles.wrapper, { backgroundColor: theme.chip }]}>
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel ? `${accessibilityLabel}: ${option.label}` : option.label}
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[
              styles.option,
              {
                backgroundColor: selected ? theme.backgroundElement : 'transparent',
              },
            ]}>
            <Text style={[styles.label, { color: selected ? theme.text : theme.textSecondary }]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: 12,
    padding: 4,
    flexDirection: 'row',
    gap: 2,
  },
  option: {
    flex: 1,
    minHeight: 36,
    minWidth: 0,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.one,
  },
  label: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
});
