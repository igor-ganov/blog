import type { Article } from '@/lib/articles/article-types';
import { matchTokens } from '@/lib/search/match-tokens';

type Searchable = Pick<Article, 'title' | 'summary' | 'principle' | 'tags'>;

const haystack = (article: Searchable): string =>
  [article.title, article.summary, article.principle, ...article.tags].join(' ');

export const matchArticle = (query: string, article: Searchable): boolean =>
  matchTokens(query, haystack(article));
