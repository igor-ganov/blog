import type { CategorySlug } from '@/lib/categories/categories';

// `existing` — already a skill today. `refine` — exists but should absorb more
// from the KB. `new` — proposed, currently only tacit or in the global config.
export type SkillStatus = 'existing' | 'refine' | 'new';

export interface ProposedSkill {
  readonly name: string;
  readonly status: SkillStatus;
  readonly scope: string;
  readonly categories: readonly CategorySlug[];
  readonly trigger: string;
}

export const proposedSkills: readonly ProposedSkill[] = [
  {
    name: 'typescript-style',
    status: 'existing',
    scope: 'No any/as/null, import type, inference over casting, validate at the boundary.',
    categories: ['typescript'],
    trigger: 'Writing or reviewing any TypeScript.',
  },
  {
    name: 'functional-frontend',
    status: 'refine',
    scope:
      'Pure-function decomposition, no branching, Effect-TS pipelines, lint-enforced — extend with parse-don’t-validate and the thin-shell boundary.',
    categories: ['functional-architecture'],
    trigger: 'Writing or refactoring any frontend logic.',
  },
  {
    name: 'angular-style',
    status: 'existing',
    scope: 'Declarative components, no div/ngFor/ngClass, signals/resource/compute, inject, host.',
    categories: ['angular'],
    trigger: 'Writing or reviewing Angular.',
  },
  {
    name: 'web-components-lit',
    status: 'new',
    scope:
      'Headless Lit elements: thin shell over a pure core, measured geometry, ARIA on the real element, legacy decorators, no SSR on the edge.',
    categories: ['web-components'],
    trigger: 'Building a Lit web component or Astro island.',
  },
  {
    name: 'playwright-testing',
    status: 'existing',
    scope: 'Event-driven waits, no timeouts, no retries, locator constants, full stable pass.',
    categories: ['testing'],
    trigger: 'Writing, running or stabilising E2E tests.',
  },
  {
    name: 'error-handling',
    status: 'new',
    scope:
      'Never swallow an error, always check res.ok, no self-rolled serializers, surface async failures.',
    categories: ['error-handling'],
    trigger: 'Any code path that can fail — fetch, parse, persist, submit.',
  },
  {
    name: 'event-driven-backend',
    status: 'new',
    scope:
      'Transactional outbox, idempotent consumers, per-engine adapters, retry/DLQ, generic services, no-crash telemetry.',
    categories: ['backend-events'],
    trigger: 'Designing reliable messaging or a service that emits/consumes events.',
  },
  {
    name: 'ddd-and-org',
    status: 'new',
    scope:
      'Bounded contexts vs CRUD features, ubiquitous language, strategic DDD, Conway & Team Topologies, small aggregates.',
    categories: ['ddd'],
    trigger: 'Architecture or org-structure decisions; decomposing a domain.',
  },
  {
    name: 'build-ci-deploy',
    status: 'new',
    scope:
      'Build-time env audited against CI, content-hashed assets, standalone CI, CRLF/LF, restore-prod-first, supply-chain automation.',
    categories: ['build-ci-deploy'],
    trigger: 'Touching CI, env config, deploy, or a production incident.',
  },
  {
    name: 'tooling-runtime',
    status: 'refine',
    scope:
      'Bun by default, never kill all node, drive the real browser over MCP, Cloudflare credentials, Windows port reservations.',
    categories: ['tooling-runtime'],
    trigger:
      'Running commands, serving, debugging against a real browser, or wrangling credentials.',
  },
  {
    name: 'spec-driven + dev-cycle',
    status: 'existing',
    scope:
      'Spec first (EARS, not user stories), phase reviews, traceability, desktop-first, screenshot proof, ticket-to-PR cycle.',
    categories: ['process'],
    trigger: 'Any non-trivial feature, from backlog to PR.',
  },
  {
    name: 'design-process',
    status: 'new',
    scope:
      'Design phase ≠ code phase, distinct designs vary many axes, minimalism/no emoji, Penpot, mobile proof on real devices.',
    categories: ['design-ux'],
    trigger: 'Any mockup, prototype, visual or design-token task.',
  },
  {
    name: 'browser-platform',
    status: 'new',
    scope:
      'Structured-clone boundary for IndexedDB, cross-origin auth that survives cookie blocking, server-side token storage, origin-scoped privacy.',
    categories: ['platform'],
    trigger: 'Persisting state, or building auth across origins.',
  },
];
