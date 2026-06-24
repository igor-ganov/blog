import type { Theme, ThemePref } from '@/lib/theme/theme-types';

// The theme the system scheme resolves to, keyed branch-free by `prefers-color-scheme`.
const systemTheme: Record<'dark' | 'light', Theme> = { dark: 'dark', light: 'light' };

// Resolve a preference to a concrete theme. Explicit prefs map straight through;
// `system` defers to the OS scheme. Keyed lookups keep it free of branching.
const fromPref: Record<ThemePref, (systemDark: boolean) => Theme> = {
  light: () => 'light',
  dark: () => 'dark',
  system: (systemDark) => systemTheme[systemDark ? 'dark' : 'light'],
};

export const resolveTheme = (pref: ThemePref, systemDark: boolean): Theme =>
  fromPref[pref](systemDark);
