import { describe, expect, it } from 'vitest';
import { sortEssays } from '@/lib/essays/sort-essays';

const post = (date: string, order: number, title: string) => ({ data: { date, order }, title });

describe('sortEssays', () => {
  it('orders newest date first', () => {
    const posts = [
      post('2026-06-10', 1, 'old'),
      post('2026-06-12', 9, 'new'),
      post('2026-06-11', 5, 'mid'),
    ];
    expect(sortEssays(posts).map((p) => p.title)).toEqual(['new', 'mid', 'old']);
  });

  it('breaks ties on the same date by ascending order', () => {
    const posts = [
      post('2026-06-11', 3, 'third'),
      post('2026-06-11', 1, 'first'),
      post('2026-06-11', 2, 'second'),
    ];
    expect(sortEssays(posts).map((p) => p.title)).toEqual(['first', 'second', 'third']);
  });

  it('does not mutate the input', () => {
    const posts = [post('2026-06-10', 1, 'a'), post('2026-06-12', 2, 'b')];
    sortEssays(posts);
    expect(posts.map((p) => p.title)).toEqual(['a', 'b']);
  });
});
