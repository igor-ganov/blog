import type { Theme } from '@/lib/theme/theme-types';

export interface ThemePresentation {
  readonly label: string;
  readonly glyph: string;
}

// What the toggle should say while the given theme is active.
const presentation: Record<Theme, ThemePresentation> = {
  light: { label: 'Switch to dark theme', glyph: '☾' },
  dark: { label: 'Switch to light theme', glyph: '☀' },
};

export const themePresentation = (theme: Theme): ThemePresentation => presentation[theme];
