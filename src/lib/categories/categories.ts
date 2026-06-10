// Single source of truth for the knowledge-base taxonomy.
// Each category is a folder under src/content/kb/<slug>/.
// Pure data + a Map lookup — no branching, no side effects.

export type CategorySlug =
  | 'typescript'
  | 'functional-architecture'
  | 'angular'
  | 'web-components'
  | 'testing'
  | 'error-handling'
  | 'ddd'
  | 'backend-events'
  | 'build-ci-deploy'
  | 'tooling-runtime'
  | 'process'
  | 'design-ux'
  | 'platform';

export interface Category {
  readonly slug: CategorySlug;
  readonly title: string;
  readonly tagline: string;
  readonly description: string;
  readonly order: number;
}

export const categories: readonly Category[] = [
  {
    slug: 'typescript',
    title: 'TypeScript & Type Safety',
    tagline: 'No any, no casting, no null.',
    description:
      'Maximal type safety through inference and design, never through `as`. Absence is modelled with `undefined` and explicit types — runtime validation only at the boundary.',
    order: 1,
  },
  {
    slug: 'functional-architecture',
    title: 'Functional Architecture',
    tagline: 'Small pure functions, no branching, composed in pipelines.',
    description:
      'One exported function per file, organised by usage, ≤50 lines. Currying, closures and higher-order functions instead of classes and conditionals. Effects pushed to a thin shell.',
    order: 2,
  },
  {
    slug: 'angular',
    title: 'Angular Conventions',
    tagline: 'Declarative, signal-first, no div / no ngFor / no ngClass.',
    description:
      'Components stay minimal and declarative: control-flow blocks, signals/resource/compute, inject(), host bindings, custom components instead of structural divs.',
    order: 3,
  },
  {
    slug: 'web-components',
    title: 'Web Components & Lit',
    tagline: 'Headless, measured, accessible Lit elements.',
    description:
      'Lit components with a pure functional core, geometry from measured sizes, ARIA on the real interactive element, legacy decorators — no SSR of custom elements on the edge.',
    order: 4,
  },
  {
    slug: 'testing',
    title: 'Testing & E2E',
    tagline: 'Event-driven, deterministic, zero timeouts, zero retries.',
    description:
      'Tests wait on real DOM and network events — never timeouts. No retries, no flakes, no programmatic exclusion. A full stable pass is the only definition of green.',
    order: 5,
  },
  {
    slug: 'error-handling',
    title: 'Error Handling',
    tagline: 'Never swallow an error. Always check res.ok.',
    description:
      'Empty catches and fabricated success are banned. Errors are values or they propagate — routed through explicit, class-filtered helpers, never hidden.',
    order: 6,
  },
  {
    slug: 'ddd',
    title: 'Domain-Driven Design & Org',
    tagline: 'Bounded contexts, ubiquitous language, Conway & Team Topologies.',
    description:
      'Strategic and tactical DDD applied with rigour: CRUD-feature clusters are not bounded contexts until language and contracts exist. Align teams to streams, not technology.',
    order: 7,
  },
  {
    slug: 'backend-events',
    title: 'Backend & Event-Driven Systems',
    tagline: 'Transactional outbox, idempotent consumers, per-engine adapters.',
    description:
      'Reliable delivery over mixed datastores: outbox in the service’s own DB, idempotent consume, retry/DLQ as first-class concerns, telemetry that can never crash the app.',
    order: 8,
  },
  {
    slug: 'build-ci-deploy',
    title: 'Build, CI/CD & Deploy',
    tagline: 'Reproducible builds, content-hashed assets, standalone CI.',
    description:
      'Build-time env audited against CI, immutable assets hashed, no self-rolled serialization, CRLF/LF discipline, restore-prod-first incident order.',
    order: 9,
  },
  {
    slug: 'tooling-runtime',
    title: 'Tooling & Runtime',
    tagline: 'Bun by default; drive the real browser; respect the one port.',
    description:
      'Bun is the default runtime. Verify against the real browser session over MCP. Never kill all node processes — only the one on the target port.',
    order: 10,
  },
  {
    slug: 'process',
    title: 'Process & Workflow',
    tagline: 'Spec-driven, desktop-first, prove it with screenshots.',
    description:
      'Spec before code (EARS, not user stories). Incremental epics that stay green. Nothing is “done” without real-browser, production-grade proof.',
    order: 11,
  },
  {
    slug: 'design-ux',
    title: 'Design & UX',
    tagline: 'Design ≠ code. Distinct designs vary many axes. Minimalism.',
    description:
      'The design phase is not the coding phase — no frameworks at the mockup stage. Real distinct directions vary layout, type, colour, motion and metaphor — not just tokens.',
    order: 12,
  },
  {
    slug: 'platform',
    title: 'Browser Platform & Persistence',
    tagline: 'Structured clone, cross-origin auth, token storage.',
    description:
      'Respect the platform: only cloneable data reaches IndexedDB, tokens never overflow cookies, cross-origin auth survives third-party-cookie blocking.',
    order: 13,
  },
];

const bySlug: ReadonlyMap<CategorySlug, Category> = new Map(
  categories.map((category) => [category.slug, category]),
);

export const categoryBySlug = (slug: CategorySlug): Category | undefined => bySlug.get(slug);
