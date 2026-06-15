import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type SegmentedControlProps<T extends string> = {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
};

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: SegmentedControlProps<T>) {
  const theme = useTheme();

  return (
    <View
      style={[styles.wrapper, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[
              styles.option,
              {
                backgroundColor: selected ? theme.primarySoft : 'transparent',
              },
            ]}>
            <Text style={[styles.label, { color: selected ? theme.primary : theme.textSecondary }]}>
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
    borderWidth: 1,
    borderRadius: 8,
    padding: 4,
    flexDirection: 'row',
    gap: 4,
  },
  option: {
    flex: 1,
    minHeight: 38,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.one,
  },
  label: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
  },
});
