import { ComponentType } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ThemeColor } from '@/constants/theme';
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
      <Text style={[styles.label, { color: theme.textSecondary }]} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.valueRow}>
        <Text style={[styles.value, { color: tone === 'accent' ? theme.primary : theme.text }]}>
          {value}
        </Text>
        {Icon ? (
          <View style={[styles.iconCircle, { backgroundColor: theme[toneBackground[tone]] }]}>
            <Icon color={color} size={16} strokeWidth={2.2} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '48.5%',
    minHeight: 98,
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 8,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  value: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
    flexShrink: 1,
  },
  label: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
});
