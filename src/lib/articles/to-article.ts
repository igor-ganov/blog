import type { CollectionEntry } from 'astro:content';
import type { Article } from '@/lib/articles/article-types';
import { splitLocaleId } from '@/lib/i18n/locales';

// Maps an Astro collection entry to the framework-agnostic view model.
// The collection id is "<locale>/<category>/<slug>"; we split off the locale so
// `id` stays locale-independent ("<category>/<slug>") — keeping `related` ids and
// routes aligned across translations.
export const toArticle = (entry: CollectionEntry<'kb'>): Article => {
  const { locale, rest } = splitLocaleId(entry.id);
  return {
    id: rest,
    locale,
    slug: rest.split('/').at(-1) ?? rest,
    category: entry.data.category,
    title: entry.data.title,
    summary: entry.data.summary,
    principle: entry.data.principle,
    severity: entry.data.severity,
    tags: entry.data.tags,
    sources: entry.data.sources,
    related: entry.data.related,
    order: entry.data.order,
  };
};
