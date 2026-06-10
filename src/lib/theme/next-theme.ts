import type { Theme } from '@/lib/theme/theme-types';

const flip: Record<Theme, Theme> = { light: 'dark', dark: 'light' };

export const nextTheme = (theme: Theme): Theme => flip[theme];
