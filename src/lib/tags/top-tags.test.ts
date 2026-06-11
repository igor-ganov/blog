import { describe, expect, it } from 'vitest';
import { makeArticle } from '@/lib/articles/make-article.fixture';
import { topTags } from '@/lib/tags/top-tags';

describe('topTags', () => {
  it('counts tag frequency across articles', () => {
    const articles = [
      makeArticle({ tags: ['testing', 'lit'] }),
      makeArticle({ tags: ['testing'] }),
      makeArticle({ tags: ['lit', 'a11y'] }),
    ];
    expect(topTags(articles, 10)).toEqual([
      { tag: 'lit', count: 2 },
      { tag: 'testing', count: 2 },
      { tag: 'a11y', count: 1 },
    ]);
  });

  it('orders by count then alphabetically for stable output', () => {
    const articles = [
      makeArticle({ tags: ['zebra', 'zebra'] }),
      makeArticle({ tags: ['alpha'] }),
      makeArticle({ tags: ['zebra'] }),
    ];
    expect(topTags(articles, 10).map((t) => t.tag)).toEqual(['zebra', 'alpha']);
  });

  it('respects the limit', () => {
    const articles = [makeArticle({ tags: ['a', 'b', 'c', 'd'] })];
    expect(topTags(articles, 2)).toHaveLength(2);
  });

  it('returns nothing for an empty corpus', () => {
    expect(topTags([], 5)).toEqual([]);
  });
});
