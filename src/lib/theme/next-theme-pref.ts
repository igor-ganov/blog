import type { ThemePref } from '@/lib/theme/theme-types';

// The cycle the toggle walks on each click: light → dark → system → light.
const cycle: Record<ThemePref, ThemePref> = {
  light: 'dark',
  dark: 'system',
  system: 'light',
};

export const nextThemePref = (pref: ThemePref): ThemePref => cycle[pref];
