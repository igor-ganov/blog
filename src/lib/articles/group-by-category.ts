import type { Article } from '@/lib/articles/article-types';
import type { CategorySlug } from '@/lib/categories/categories';

// Fold a flat list into category buckets. No branching: a missing bucket
// defaults to an empty list via `??` before being extended.
export const groupByCategory = (
  articles: readonly Article[],
): ReadonlyMap<CategorySlug, readonly Article[]> =>
  articles.reduce(
    (acc, article) => acc.set(article.category, [...(acc.get(article.category) ?? []), article]),
    new Map<CategorySlug, readonly Article[]>(),
  );
