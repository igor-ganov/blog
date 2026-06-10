import type { Article } from '@/lib/articles/article-types';

// The freshest provenance date wins — used to surface "newer overrides older".
// ISO YYYY-MM-DD sorts lexically, so a plain max over strings is correct.
export const latestSourceDate = (article: Pick<Article, 'sources'>): string | undefined =>
  article.sources
    .map((source) => source.date)
    .reduce<string | undefined>(
      (latest, date) => [latest, date].filter(Boolean).sort().at(-1),
      undefined,
    );
