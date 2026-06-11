import { describe, expect, it } from 'vitest';
import { trapIndex } from '@/lib/focus/trap-index';

describe('trapIndex', () => {
  it('advances forward', () => {
    expect(trapIndex(0, 3, false)).toBe(1);
  });

  it('wraps forward past the last element to the first', () => {
    expect(trapIndex(2, 3, false)).toBe(0);
  });

  it('steps backward', () => {
    expect(trapIndex(2, 3, true)).toBe(1);
  });

  it('wraps backward from the first element to the last', () => {
    expect(trapIndex(0, 3, true)).toBe(2);
  });
});
