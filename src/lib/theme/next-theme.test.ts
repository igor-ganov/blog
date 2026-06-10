import { describe, expect, it } from 'vitest';
import { coerceTheme } from '@/lib/theme/coerce-theme';
import { nextTheme } from '@/lib/theme/next-theme';

describe('nextTheme', () => {
  it('toggles between light and dark', () => {
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('light');
  });

  it('is its own inverse', () => {
    expect(nextTheme(nextTheme('light'))).toBe('light');
  });
});

describe('coerceTheme', () => {
  it('passes known themes through', () => {
    expect(coerceTheme('dark')).toBe('dark');
    expect(coerceTheme('light')).toBe('light');
  });

  it('defaults unknown or missing values to light', () => {
    expect(coerceTheme(undefined)).toBe('light');
    expect(coerceTheme('purple')).toBe('light');
  });
});
