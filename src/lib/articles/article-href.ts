import type { Article } from '@/lib/articles/article-types';
import { withBase } from '@/lib/url/with-base';

// The id already encodes "<category>/<slug>", so it is the canonical route.
export const articleHref = (article: Pick<Article, 'id'>): string => withBase(`/kb/${article.id}`);
