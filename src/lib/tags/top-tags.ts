import type { Article } from '@/lib/articles/article-types';

export interface TagCount {
  readonly tag: string;
  readonly count: number;
}

// The most-used tags across the corpus, for the quick-filter chips. Ordered by
// frequency, ties broken alphabetically so the row is stable build to build.
export const topTags = (articles: readonly Article[], limit: number): readonly TagCount[] => {
  const counts = new Map<string, number>();
  for (const article of articles) {
    for (const tag of article.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, limit);
};
