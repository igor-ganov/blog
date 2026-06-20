import type { Article } from '@/lib/articles/article-types';
import { withLocale } from '@/lib/i18n/locale-url';

// The article carries its own locale and locale-independent id ("<category>/<slug>"),
// so the route is "/<locale>/kb/<category>/<slug>".
export const articleHref = (article: Pick<Article, 'id' | 'locale'>): string =>
  withLocale(article.locale, `/kb/${article.id}`);
