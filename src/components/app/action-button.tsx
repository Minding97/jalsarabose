import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

type ActionButtonVariant = 'primary' | 'secondary' | 'danger';

type ActionButtonProps = {
  children: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  variant?: ActionButtonVariant;
  style?: ViewStyle;
  testID?: string;
  accessibilityLabel?: string;
};

export function ActionButton({
  children,
  onPress,
  disabled,
  variant = 'primary',
  style,
  testID,
  accessibilityLabel,
}: ActionButtonProps) {
  const theme = useTheme();
  const label = typeof children === 'string' ? children : accessibilityLabel;
  const backgroundColor =
    variant === 'primary'
      ? theme.primary
      : variant === 'danger'
        ? theme.dangerSoft
        : theme.chip;
  const borderColor = variant === 'primary' ? theme.primary : 'transparent';
  const color =
    variant === 'primary'
      ? theme.backgroundElement
      : variant === 'danger'
        ? theme.danger
        : theme.textSecondary;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor,
          borderColor,
          opacity: disabled ? 0.45 : pressed ? 0.72 : 1,
        },
        style,
      ]}>
      <Text style={[styles.label, { color }]}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
  },
});
