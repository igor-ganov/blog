import type { Article } from '@/lib/articles/article-types';

// The id already encodes "<category>/<slug>", so it is the canonical route.
export const articleHref = (article: Pick<Article, 'id'>): string => `/kb/${article.id}`;
