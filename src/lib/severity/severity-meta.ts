import type { Severity } from '@/lib/articles/article-types';

export interface SeverityMeta {
  readonly label: string;
  readonly weight: number;
  readonly cssVar: string;
}

// Strategy lookup instead of a switch/if-chain: total over the Severity union.
const table: Record<Severity, SeverityMeta> = {
  'non-negotiable': { label: 'Non-negotiable', weight: 0, cssVar: '--sev-nonneg' },
  strong: { label: 'Strong', weight: 1, cssVar: '--sev-strong' },
  preferred: { label: 'Preferred', weight: 2, cssVar: '--sev-preferred' },
  context: { label: 'Contextual', weight: 3, cssVar: '--sev-context' },
};

export const severityMeta = (severity: Severity): SeverityMeta => table[severity];
