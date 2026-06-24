import type { ThemePref } from '@/lib/theme/theme-types';

const known: Record<string, ThemePref> = { light: 'light', dark: 'dark', system: 'system' };

// Any unknown/undefined value collapses to 'system' — the sensible default.
export const coerceThemePref = (value: string | undefined): ThemePref =>
  known[value ?? ''] ?? 'system';
