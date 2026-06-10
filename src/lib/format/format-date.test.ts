import { describe, expect, it } from 'vitest';
import { formatDate } from '@/lib/format/format-date';

describe('formatDate', () => {
  it('formats an ISO date to a readable label', () => {
    expect(formatDate('2026-05-31')).toBe('May 31, 2026');
  });

  it('drops a leading zero from the day', () => {
    expect(formatDate('2026-03-09')).toBe('Mar 9, 2026');
  });

  it('handles December (last month index)', () => {
    expect(formatDate('2025-12-25')).toBe('Dec 25, 2025');
  });
});
