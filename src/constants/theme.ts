/**
 * SERVEXA Design System
 *
 * Warm ivory / near-black palette — premium, minimal, editorial.
 * Accent: teal-leaning #137A82 (existing brand colour kept).
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  // Semantic tokens used everywhere
  ivory: '#F7F4EF',          // warm off-white background
  ivoryDeep: '#EDE9E2',      // slightly darker surface
  ink: '#1A1A1A',            // near-black primary text
  inkMuted: '#6B6560',       // secondary / muted text
  inkFaint: '#A09890',       // placeholder / tertiary text
  border: '#DDD9D2',         // subtle dividers
  borderStrong: '#C5C0B8',   // stronger dividers
  accent: '#137A82',         // SERVEXA teal
  accentLight: '#EAF5F6',    // teal tint background
  accentText: '#0E5F66',     // teal on light bg
  surface: '#FFFFFF',        // card / panel surface
  surfaceRaised: '#F9F6F1',  // slightly elevated surface
  brand: '#172A3A',          // dark brand / hero bg
  brandMid: '#233545',       // slightly lighter dark
  positive: '#3FA77C',
  positiveLight: '#EEF7F3',
  attention: '#C95F47',
  attentionLight: '#FFF1ED',
  neutral: '#737D87',
  neutralLight: '#F2F4F6',

  light: {
    text: '#1A1A1A',
    background: '#F7F4EF',
    backgroundElement: '#EDE9E2',
    backgroundSelected: '#DDD9D2',
    textSecondary: '#6B6560',
  },
  dark: {
    text: '#F7F4EF',
    background: '#1A1A1A',
    backgroundElement: '#2A2520',
    backgroundSelected: '#3A3530',
    textSecondary: '#A09890',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS system serif — elegant for hero headlines */
    display: 'ui-serif',
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    display: 'serif',
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    display: 'var(--font-display)',
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

export const Radius = {
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
  full: 999,
} as const;

export const Shadow = {
  subtle: {
    shadowColor: '#1A1A1A',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  card: {
    shadowColor: '#1A1A1A',
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
