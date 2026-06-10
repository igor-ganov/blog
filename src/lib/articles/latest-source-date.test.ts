import { describe, expect, it } from 'vitest';
import { latestSourceDate } from '@/lib/articles/latest-source-date';

describe('latestSourceDate', () => {
  it('returns undefined when there are no sources', () => {
    expect(latestSourceDate({ sources: [] })).toBeUndefined();
  });

  it('returns the single date', () => {
    expect(latestSourceDate({ sources: [{ project: 'p', date: '2026-04-11' }] })).toBe(
      '2026-04-11',
    );
  });

  it('returns the newest date across sources regardless of input order', () => {
    const sources = [
      { project: 'a', date: '2026-03-14' },
      { project: 'b', date: '2026-05-31' },
      { project: 'c', date: '2026-04-30' },
    ];
    expect(latestSourceDate({ sources })).toBe('2026-05-31');
  });
});
