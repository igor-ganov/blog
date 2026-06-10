# Proposed skill system

The knowledge base is the source material; a **skill** is its operational form — a focused
bundle of practices the assistant loads on demand when matching work appears. This document
proposes how to turn the 13 categories into a coherent skill set: which skills already
exist, which should absorb more of the KB, and which are new.

Status legend: **Exists** (a skill today) · **Refine** (exists, should grow) · **Proposed** (new).

| Skill | Status | Draws from | Use when |
| --- | --- | --- | --- |
| `typescript-style` | Exists | TypeScript & Type Safety | Writing or reviewing any TypeScript |
| `functional-frontend` | Refine | Functional Architecture | Writing or refactoring frontend logic |
| `angular-style` | Exists | Angular Conventions | Writing or reviewing Angular |
| `web-components-lit` | Proposed | Web Components & Lit | Building a Lit element or Astro island |
| `playwright-testing` | Exists | Testing & E2E | Writing/stabilising E2E tests |
| `error-handling` | Proposed | Error Handling | Any code path that can fail |
| `event-driven-backend` | Proposed | Backend & Event-Driven Systems | Reliable messaging / event services |
| `ddd-and-org` | Proposed | Domain-Driven Design & Org | Architecture / org-structure decisions |
| `build-ci-deploy` | Proposed | Build, CI/CD & Deploy | CI, env, deploy, or a prod incident |
| `tooling-runtime` | Refine | Tooling & Runtime | Running commands, debugging, credentials |
| `spec-driven` + `dev-cycle` | Exists | Process & Workflow | Any non-trivial feature, backlog→PR |
| `design-process` | Proposed | Design & UX | Any mockup / prototype / token task |
| `browser-platform` | Proposed | Browser Platform & Persistence | Persistence, or cross-origin auth |

## Recommended actions

**Create five new skills** from categories that are currently only tacit or scattered in
the global config:

- **`web-components-lit`** — the Lit conventions (thin shell over a pure core, measured
  geometry, ARIA on the real element, legacy decorators, no edge SSR). Today these live as
  project memory, not a skill.
- **`error-handling`** — never swallow, always check `res.ok`, no self-rolled serializers,
  surface async failures. This is a recurring source of production incidents and deserves
  its own always-loaded skill.
- **`event-driven-backend`** — the outbox / idempotent-consumer / per-engine-adapter /
  retry-DLQ / no-crash-telemetry stack from event-sourcing service work.
- **`ddd-and-org`** — strategic & tactical DDD plus Conway / Team Topologies, with the
  source-backed-claims discipline baked in.
- **`design-process`** — the design-phase-is-not-code-phase rule and friends; this prevents
  the recurring "proposed Angular for a mockup" mistake.
- **`browser-platform`** — structured-clone boundary, cookie-size limits, cross-origin auth.

**Refine two:**

- **`functional-frontend`** — add *parse-don't-validate* and the thin-imperative-shell
  boundary explicitly.
- **`tooling-runtime`** — promote the bun-default + never-kill-all-node + real-browser-MCP
  + Cloudflare-credential rules from the global `CLAUDE.md` into a discrete, triggerable
  skill so they load with full detail only when relevant.

## Skill authoring shape

Each skill is a `SKILL.md` with frontmatter (`name`, `description` with a "Use when"
trigger) and a body of concrete rules. The articles in the matching KB category are the
canonical content — a skill is the compressed, always-actionable distillation, and the KB
is the long-form reference with provenance. Keep them in sync: when a practice changes,
update the article (with a new dated source) first, then the skill.
