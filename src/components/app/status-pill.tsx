import { StyleSheet, Text, View } from 'react-native';

import { ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Tone = 'primary' | 'accent' | 'warning' | 'danger' | 'info';

type StatusPillProps = {
  label: string;
  tone: Tone;
};

const toneText: Record<Tone, ThemeColor> = {
  primary: 'primary',
  accent: 'accent',
  warning: 'warning',
  danger: 'danger',
  info: 'info',
};

const toneBg: Record<Tone, ThemeColor> = {
  primary: 'primarySoft',
  accent: 'accentSoft',
  warning: 'warningSoft',
  danger: 'dangerSoft',
  info: 'infoSoft',
};

export function StatusPill({ label, tone }: StatusPillProps) {
  const theme = useTheme();

  return (
    <View style={[styles.pill, { backgroundColor: theme[toneBg[tone]] }]}>
      <Text style={[styles.label, { color: theme[toneText[tone]] }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    minHeight: 26,
    borderRadius: 100,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
});
