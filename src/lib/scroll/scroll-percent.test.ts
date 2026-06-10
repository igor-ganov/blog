import { describe, expect, it } from 'vitest';
import { scrollPercent } from '@/lib/scroll/scroll-percent';

describe('scrollPercent', () => {
  it('is 0 at the top', () => {
    expect(scrollPercent(0, 1000)).toBe(0);
  });

  it('is 100 at the bottom', () => {
    expect(scrollPercent(1000, 1000)).toBe(100);
  });

  it('rounds the midpoint', () => {
    expect(scrollPercent(500, 1000)).toBe(50);
  });

  it('clamps and guards a zero scroll range', () => {
    expect(scrollPercent(50, 0)).toBe(100);
    expect(scrollPercent(-10, 1000)).toBe(0);
  });
});
