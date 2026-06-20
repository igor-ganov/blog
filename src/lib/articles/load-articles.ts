import { getCollection } from 'astro:content';
import type { Article } from '@/lib/articles/article-types';
import { sortArticles } from '@/lib/articles/sort-articles';
import { toArticle } from '@/lib/articles/to-article';
import type { Locale } from '@/lib/i18n/locales';

// The imperative shell: pull the collection once, map to view models, keep the
// requested locale, sort. Pure functions downstream never touch Astro APIs.
export const loadArticles = async (locale: Locale): Promise<readonly Article[]> => {
  const entries = await getCollection('kb', (entry) => entry.data.draft === false);
  return sortArticles(entries.map(toArticle).filter((article) => article.locale === locale));
};
