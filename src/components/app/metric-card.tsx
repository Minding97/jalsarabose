import { ComponentType } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Spacing, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type MetricTone = 'primary' | 'accent' | 'warning' | 'info';

type IconProps = {
  color?: string;
  size?: number;
  strokeWidth?: number;
};

type MetricCardProps = {
  label: string;
  value: string;
  tone: MetricTone;
  icon?: ComponentType<IconProps>;
};

const toneColor: Record<MetricTone, ThemeColor> = {
  primary: 'primary',
  accent: 'accent',
  warning: 'warning',
  info: 'info',
};

const toneBackground: Record<MetricTone, ThemeColor> = {
  primary: 'primarySoft',
  accent: 'accentSoft',
  warning: 'warningSoft',
  info: 'infoSoft',
};

export function MetricCard({ label, value, tone, icon: Icon }: MetricCardProps) {
  const theme = useTheme();
  const color = theme[toneColor[tone]];

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.border,
        },
      ]}>
      <View style={[styles.iconCircle, { backgroundColor: theme[toneBackground[tone]] }]}>
        {Icon ? (
          <Icon color={color} size={18} strokeWidth={2.4} />
        ) : (
          <View style={[styles.dot, { backgroundColor: color }]} />
        )}
      </View>
      <Text style={[styles.value, { color: theme.text }]}>{value}</Text>
      <Text style={[styles.label, { color: theme.textSecondary }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '48.5%',
    minHeight: 118,
    borderWidth: 1,
    borderRadius: 8,
    padding: Spacing.three,
    justifyContent: 'space-between',
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  value: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '900',
  },
  label: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
});
