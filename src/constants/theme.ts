import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#1E1C1A',
    background: '#FAF9F5',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E3F8EC',
    frameOutside: '#EDEAE4',
    chip: '#F1EFEA',
    textSecondary: '#8C877F',
    textTertiary: '#B5B0A8',
    border: '#ECE8E1',
    primary: '#17B854',
    primarySoft: '#E3F8EC',
    accent: '#17B854',
    accentSoft: '#E3F8EC',
    warning: '#C67B28',
    warningSoft: '#FFF1DC',
    danger: '#C85C52',
    dangerSoft: '#FCE9E7',
    info: '#5D7970',
    infoSoft: '#EAF1EE',
  },
  dark: {
    text: '#1E1C1A',
    background: '#FAF9F5',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E3F8EC',
    frameOutside: '#EDEAE4',
    chip: '#F1EFEA',
    textSecondary: '#8C877F',
    textTertiary: '#B5B0A8',
    border: '#ECE8E1',
    primary: '#17B854',
    primarySoft: '#E3F8EC',
    accent: '#17B854',
    accentSoft: '#E3F8EC',
    warning: '#C67B28',
    warningSoft: '#FFF1DC',
    danger: '#C85C52',
    dangerSoft: '#FCE9E7',
    info: '#5D7970',
    infoSoft: '#EAF1EE',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 12,
  four: 16,
  five: 20,
  six: 24,
} as const;

export const BottomTabInset = Platform.select({ ios: 20, android: 24 }) ?? 0;
export const MaxContentWidth = 402;
