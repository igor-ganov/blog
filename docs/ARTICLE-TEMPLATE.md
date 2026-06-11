# Article authoring template

Every knowledge-base article lives at `src/content/kb/<category>/<slug>.md` and is a
**deep dive** grounded in a real project decision. Keep the voice direct, technical,
and free of ceremony. English only. No emoji.

## Frontmatter (validated by `src/content.config.ts`)

```yaml
---
title: 'Human title of the practice'
category: typescript # one of the 13 category slugs
summary: 'One sentence shown on cards and in meta description.'
principle: 'The rule itself, imperative, one sentence.'
severity: non-negotiable # non-negotiable | strong | preferred | context
tags: [typescript, type-safety]
sources:
  - project: 'a content-admin SPA'
    date: 2026-03-25 # YYYY-MM-DD — provenance date from the source decision
    note: 'Short note on where this came from.'
related:
  - typescript/no-null-use-undefined # ids of related articles (category/slug)
order: 1 # position within the category
updated: 2026-03-25 # optional
---
```

### Severity scale

- **non-negotiable** — never up for debate; violating it is a defect.
- **strong** — the default; deviate only with an explicit, recorded reason.
- **preferred** — the house style; reasonable exceptions exist.
- **context** — situational guidance that depends on the project.

## Body — required `##` sections, in this order

1. `## Why this matters` — the reasoning, and the concrete incident or project
   decision that taught it (this is the provenance narrative; cite the source and date).
2. `## How to apply` — concrete, actionable steps with **code examples**.
3. `## Anti-patterns` — what NOT to do, with code, and the symptom each produces.
4. `## Enforcement` — optional: lint rule, CI gate, or review check that guarantees it.
5. `## See also` — optional prose links; the `related` frontmatter renders separately.

## Rules for the prose

- Lead with the rule, then the cost of breaking it, then the fix.
- Prefer real numbers and real symptoms over abstractions ("took prod red for two
  days", "11 chromium suites failed at once").
- When a newer decision overrides an older one, say so explicitly and date both.
- Code blocks are TypeScript unless the topic is otherwise; show the bad case and the
  good case side by side where it clarifies.
- Two to five `##` sections; aim for 150–400 lines of markdown for a deep dive.

## Global slug index (for `related` and in-prose `/kb/<category>/<slug>` links)

Use these exact ids so cross-links resolve. Three are already written
(`typescript/no-casting`, `testing/event-driven-no-timeouts`,
`error-handling/never-swallow-errors`) — do not recreate them.

- **typescript/**: no-casting · no-null-use-undefined · validate-at-the-boundary · prefer-inference-and-import-type · native-ts-node-scripts
- **functional-architecture/**: one-function-per-file-folder-by-usage · no-branching-switch-and-strategies · currying-closures-higher-order · errors-as-values-with-effect · lint-enforces-architecture · parse-dont-validate
- **angular/**: no-div-components-not-containers · control-flow-blocks-not-directives · signals-resource-compute · inject-and-host-bindings · services-as-functions · no-material-native-web-platform
- **web-components/**: lit-functional-core · measured-geometry-not-hardcoded · aria-on-the-real-element · lit-legacy-decorators-no-accessor · no-ssr-custom-elements-on-edge
- **testing/**: event-driven-no-timeouts · no-retries-no-flakes · locator-constants · wait-for-service-worker-settle · aria-label-test-locator-hygiene · native-drag-and-drop-for-tests
- **error-handling/**: never-swallow-errors · always-check-res-ok · no-self-rolled-yaml · surface-async-form-errors
- **ddd/**: bounded-contexts-not-crud-features · ubiquitous-language-first · strategic-ddd-core-supporting-generic · conway-and-team-topologies · small-aggregates-by-identity
- **backend-events/**: transactional-outbox-idempotent-consumer · storage-in-service-db-per-engine-adapters · saga-is-not-an-outbox · retry-and-dlq-first-class · generic-service-no-per-domain-endpoints · telemetry-never-crashes
- **build-ci-deploy/**: build-time-env-is-baked · content-hashed-immutable-assets · standalone-submodule-ci · crlf-lf-discipline · restore-prod-first-incident-order · dependabot-codeql-automerge
- **tooling-runtime/**: bun-by-default · never-kill-all-node · drive-the-real-browser-over-mcp · cloudflare-credential-types · windows-winnat-reserved-ports · prefer-http-oauth-mcp-flow
- **process/**: spec-driven-ears-not-user-stories · traceability-and-phase-reviews · desktop-target-first · prove-with-production-screenshots · incremental-epics-stay-green · spike-riskiest-first · cite-sources-no-improvisation · dev-cycle-branch-commit-pr
- **design-ux/**: design-phase-is-not-code-phase · distinct-designs-vary-many-axes · minimalism-no-emoji-schematic · mobile-proof-real-devices · penpot-is-the-design-tool · suppress-tap-highlight
- **platform/**: idb-structured-clone-boundary · cross-origin-auth-survives-cookie-blocking · tokens-dont-fit-in-cookies · origin-scoped-storage-privacy
