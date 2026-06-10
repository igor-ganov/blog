import type { Article } from '@/lib/articles/article-types';

// Stable sort key: zero-padded order then title. Composing the key as a string
// avoids the `||` fallback chain a multi-field comparator would otherwise need.
const sortKey = (article: Article): string =>
  `${String(article.order).padStart(6, '0')}:${article.title.toLowerCase()}`;

export const sortArticles = (articles: readonly Article[]): readonly Article[] =>
  [...articles].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
