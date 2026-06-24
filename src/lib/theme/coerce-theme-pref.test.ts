import { describe, expect, it } from 'vitest';
import { coerceThemePref } from '@/lib/theme/coerce-theme-pref';

describe('coerceThemePref', () => {
  it('passes known preferences through', () => {
    expect(coerceThemePref('light')).toBe('light');
    expect(coerceThemePref('dark')).toBe('dark');
    expect(coerceThemePref('system')).toBe('system');
  });

  it('defaults unknown or missing values to system', () => {
    expect(coerceThemePref(undefined)).toBe('system');
    expect(coerceThemePref('purple')).toBe('system');
  });
});
