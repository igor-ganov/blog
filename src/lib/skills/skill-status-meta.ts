import type { SkillStatus } from '@/lib/skills/proposed-skills';

export interface SkillStatusMeta {
  readonly label: string;
  readonly cssVar: string;
}

const table: Record<SkillStatus, SkillStatusMeta> = {
  existing: { label: 'Exists', cssVar: '--sev-strong' },
  refine: { label: 'Refine', cssVar: '--sev-preferred' },
  new: { label: 'Proposed', cssVar: '--sev-nonneg' },
};

export const skillStatusMeta = (status: SkillStatus): SkillStatusMeta => table[status];
