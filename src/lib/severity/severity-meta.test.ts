import { describe, expect, it } from 'vitest';
import type { Severity } from '@/lib/articles/article-types';
import { severityMeta } from '@/lib/severity/severity-meta';

describe('severityMeta', () => {
  it('maps every severity to a distinct weight and css var', () => {
    const all: readonly Severity[] = ['non-negotiable', 'strong', 'preferred', 'context'];
    const weights = all.map((s) => severityMeta(s).weight);
    expect(new Set(weights).size).toBe(4);
    expect(weights).toEqual([0, 1, 2, 3]);
  });

  it('labels non-negotiable explicitly', () => {
    expect(severityMeta('non-negotiable').label).toBe('Non-negotiable');
    expect(severityMeta('non-negotiable').cssVar).toBe('--sev-nonneg');
  });
});
