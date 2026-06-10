import type { Theme } from '@/lib/theme/theme-types';

const known: Record<string, Theme> = { light: 'light', dark: 'dark' };

// Any unknown/undefined value collapses to 'light' — no branching.
export const coerceTheme = (value: string | undefined): Theme => known[value ?? ''] ?? 'light';
