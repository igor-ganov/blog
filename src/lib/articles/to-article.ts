import type { CollectionEntry } from 'astro:content';
import type { Article } from '@/lib/articles/article-types';

// Maps an Astro collection entry to the framework-agnostic view model.
// No casting: entry.data is already typed by the content schema.
export const toArticle = (entry: CollectionEntry<'kb'>): Article => ({
  id: entry.id,
  slug: entry.id.split('/').at(-1) ?? entry.id,
  category: entry.data.category,
  title: entry.data.title,
  summary: entry.data.summary,
  principle: entry.data.principle,
  severity: entry.data.severity,
  tags: entry.data.tags,
  sources: entry.data.sources,
  related: entry.data.related,
  order: entry.data.order,
});
