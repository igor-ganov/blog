import type { Article } from '@/lib/articles/article-types';

// Test-only factory: a complete Article with overridable fields.
export const makeArticle = (overrides: Partial<Article> = {}): Article => ({
  id: 'typescript/sample',
  slug: 'sample',
  category: 'typescript',
  title: 'Sample',
  summary: 'A sample article.',
  principle: 'Do the sample thing.',
  severity: 'preferred',
  tags: [],
  sources: [],
  related: [],
  order: 100,
  ...overrides,
});
