import { describe, expect, it } from 'vitest';
import { matchesTags } from '@/lib/tags/matches-tags';

describe('matchesTags', () => {
  it('matches everything when no tag is active', () => {
    expect(matchesTags([], ['testing'])).toBe(true);
  });

  it('matches when the item carries an active tag', () => {
    expect(matchesTags(['lit'], ['testing', 'lit'])).toBe(true);
  });

  it('matches on any active tag (OR), not all', () => {
    expect(matchesTags(['lit', 'angular'], ['lit'])).toBe(true);
  });

  it('rejects when the item shares none of the active tags', () => {
    expect(matchesTags(['angular'], ['testing', 'lit'])).toBe(false);
  });
});
