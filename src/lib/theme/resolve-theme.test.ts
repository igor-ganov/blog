import { describe, expect, it } from 'vitest';
import { resolveTheme } from '@/lib/theme/resolve-theme';

describe('resolveTheme', () => {
  it('passes explicit preferences through, ignoring the system scheme', () => {
    expect(resolveTheme('light', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('dark', true)).toBe('dark');
  });

  it('follows the system scheme when the preference is system', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});
