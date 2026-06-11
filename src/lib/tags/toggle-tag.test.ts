import { describe, expect, it } from 'vitest';
import { toggleTag } from '@/lib/tags/toggle-tag';

describe('toggleTag', () => {
  it('adds a tag that is not active', () => {
    expect(toggleTag(['testing'], 'lit')).toEqual(['testing', 'lit']);
  });

  it('removes a tag that is already active', () => {
    expect(toggleTag(['testing', 'lit'], 'testing')).toEqual(['lit']);
  });

  it('toggles back to empty', () => {
    expect(toggleTag(['lit'], 'lit')).toEqual([]);
  });

  it('does not mutate the input', () => {
    const input = ['testing'];
    toggleTag(input, 'lit');
    expect(input).toEqual(['testing']);
  });
});
