/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#17211B',
    background: '#F7F9F6',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E6F4ED',
    textSecondary: '#617067',
    border: '#DCE5DD',
    primary: '#167C5A',
    primarySoft: '#DDF5EA',
    accent: '#EC6F5E',
    accentSoft: '#FFE6E0',
    warning: '#A66A10',
    warningSoft: '#FFF2C9',
    danger: '#C94747',
    dangerSoft: '#FFE0E0',
    info: '#2C6EBD',
    infoSoft: '#E3F0FF',
  },
  dark: {
    text: '#F3F7F4',
    background: '#101713',
    backgroundElement: '#18231D',
    backgroundSelected: '#203A2D',
    textSecondary: '#B4C2B9',
    border: '#2B3A31',
    primary: '#72D7AA',
    primarySoft: '#123D2C',
    accent: '#FF9B8D',
    accentSoft: '#4B211C',
    warning: '#F2C166',
    warningSoft: '#3B2B10',
    danger: '#FF8D8D',
    dangerSoft: '#461D1D',
    info: '#8DBDFF',
    infoSoft: '#182E4C',
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
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
