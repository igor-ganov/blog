import { describe, expect, it } from 'vitest';
import { makeArticle } from '@/lib/articles/make-article.fixture';
import { sortArticles } from '@/lib/articles/sort-articles';

describe('sortArticles', () => {
  it('orders by numeric order first', () => {
    const a = makeArticle({ title: 'Z', order: 1 });
    const b = makeArticle({ title: 'A', order: 2 });
    expect(sortArticles([b, a]).map((x) => x.title)).toEqual(['Z', 'A']);
  });

  it('breaks ties on order by case-insensitive title', () => {
    const a = makeArticle({ title: 'banana', order: 5 });
    const b = makeArticle({ title: 'Apple', order: 5 });
    expect(sortArticles([a, b]).map((x) => x.title)).toEqual(['Apple', 'banana']);
  });

  it('treats order 2 and 10 numerically, not lexically', () => {
    const a = makeArticle({ title: 'ten', order: 10 });
    const b = makeArticle({ title: 'two', order: 2 });
    expect(sortArticles([a, b]).map((x) => x.order)).toEqual([2, 10]);
  });

  it('does not mutate the input', () => {
    const input = [makeArticle({ order: 2 }), makeArticle({ order: 1 })];
    sortArticles(input);
    expect(input.map((x) => x.order)).toEqual([2, 1]);
  });
});
