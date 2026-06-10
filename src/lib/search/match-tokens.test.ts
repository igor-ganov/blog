import { describe, expect, it } from 'vitest';
import { matchTokens } from '@/lib/search/match-tokens';

describe('matchTokens', () => {
  it('matches everything on an empty or blank query', () => {
    expect(matchTokens('', 'anything')).toBe(true);
    expect(matchTokens('  ', 'anything')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(matchTokens('Effect', 'we use effect-ts pipelines')).toBe(true);
  });

  it('requires all tokens (AND)', () => {
    expect(matchTokens('effect pipeline', 'effect pipeline composition')).toBe(true);
    expect(matchTokens('effect angular', 'effect pipeline composition')).toBe(false);
  });
});
