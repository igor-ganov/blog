import { getCollection } from 'astro:content';
import type { Article } from '@/lib/articles/article-types';
import { sortArticles } from '@/lib/articles/sort-articles';
import { toArticle } from '@/lib/articles/to-article';

// The imperative shell: pull the collection once, map to view models, sort.
// Pure functions downstream never touch Astro APIs.
export const loadArticles = async (): Promise<readonly Article[]> => {
  const entries = await getCollection('kb', (entry) => entry.data.draft === false);
  return sortArticles(entries.map(toArticle));
};
