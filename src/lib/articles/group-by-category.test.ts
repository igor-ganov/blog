import { describe, expect, it } from 'vitest';
import { groupByCategory } from '@/lib/articles/group-by-category';
import { makeArticle } from '@/lib/articles/make-article.fixture';

describe('groupByCategory', () => {
  it('returns an empty map for no articles', () => {
    expect(groupByCategory([]).size).toBe(0);
  });

  it('buckets articles by their category, preserving order', () => {
    const a = makeArticle({ id: 'typescript/a', category: 'typescript' });
    const b = makeArticle({ id: 'testing/b', category: 'testing' });
    const c = makeArticle({ id: 'typescript/c', category: 'typescript' });

    const grouped = groupByCategory([a, b, c]);

    expect(grouped.get('typescript')).toEqual([a, c]);
    expect(grouped.get('testing')).toEqual([b]);
    expect(grouped.get('angular')).toBeUndefined();
  });

  it('does not mutate the input', () => {
    const input = [makeArticle()];
    groupByCategory(input);
    expect(input).toHaveLength(1);
  });
});
