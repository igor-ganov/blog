import { describe, expect, it } from 'vitest';
import { matchArticle } from '@/lib/search/match-article';

const article = {
  title: 'No casting',
  summary: 'Avoid the as keyword entirely.',
  principle: 'Reach for inference, never a cast.',
  tags: ['typescript', 'types'],
};

describe('matchArticle', () => {
  it('matches everything on an empty query', () => {
    expect(matchArticle('', article)).toBe(true);
    expect(matchArticle('   ', article)).toBe(true);
  });

  it('matches a token found in the title', () => {
    expect(matchArticle('casting', article)).toBe(true);
  });

  it('matches across fields and tags, case-insensitively', () => {
    expect(matchArticle('INFERENCE types', article)).toBe(true);
  });

  it('requires every token to match (AND semantics)', () => {
    expect(matchArticle('casting angular', article)).toBe(false);
  });
});
