import type { Article } from '@/lib/articles/article-types';

// The text a card exposes via data-haystack for the client-side filter.
export const articleHaystack = (article: Article): string =>
  [article.title, article.summary, article.principle, article.category, ...article.tags].join(' ');
