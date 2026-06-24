import { describe, expect, it } from 'vitest';
import { nextThemePref } from '@/lib/theme/next-theme-pref';

describe('nextThemePref', () => {
  it('cycles light -> dark -> system', () => {
    expect(nextThemePref('light')).toBe('dark');
    expect(nextThemePref('dark')).toBe('system');
    expect(nextThemePref('system')).toBe('light');
  });

  it('returns to the start after a full cycle', () => {
    expect(nextThemePref(nextThemePref(nextThemePref('light')))).toBe('light');
  });
});
