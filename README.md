# Engineering Practices — a living knowledge base

A written record of how I build software: the practices, conventions and hard-won
lessons that govern code, architecture, testing, tooling and design. Every article is
distilled from a **real decision on a real project** — dated and sourced — and rendered
as a static blog built with the very stack and rules it documents.

**72 practices · 13 categories**, each a deep dive: the rule, *why* it exists (with the
incident that taught it), how to apply it, the anti-patterns, and how it is enforced.

## Why this exists

1. **Keep the knowledge current** — turn scattered, tacit habit into something reviewable.
2. **Check that the work matches the intent** — each practice is falsifiable and can be corrected here.
3. **Sharpen the skill system** — the raw material for a more precise set of reusable skills (see [`docs/SKILLS-PROPOSAL.md`](docs/SKILLS-PROPOSAL.md)).
4. **Share it** — everything here generalises beyond the project it came from.

When two decisions conflict, the **newer one wins** and the article says so with both dates.

## The site is its own proof

It practises what it documents:

- **Astro 5, static output** — the whole KB is content; first paint is well under 1s.
- **Lit islands loaded client-side**, never SSR-rendered on the edge (the `@astrojs/lit`
  Workers crash is documented in the KB).
- **Strict TypeScript** — no `any`, no `as`, no `null`; `verbatimModuleSyntax`; legacy
  decorators for Lit (`useDefineForClassFields: false`, never the `accessor` keyword).
- **Functional core** — small pure functions, one export per file, organised by usage,
  no `if`/ternary (switch and strategy maps), unit-tested with Vitest.
- **Event-driven Playwright E2E** — no timeouts, no retries, locator constants colocated
  with each component; three stable runs are the bar.
- **Biome** enforces `noEmptyBlockStatements`, `noExplicitAny`, `noNonNullAssertion` in CI.

## Run it

The default runtime is **bun**.

```bash
bun install
bun run dev        # dev server
bun run build      # astro check + static build  → dist/
bun run preview    # serve the build
bun run test       # Vitest unit tests (pure functions)
bun run test:e2e   # Playwright E2E (builds + previews + runs)
bun run lint       # Biome (format + lint, CI mode)
```

## Project structure

```
src/
  content/
    config (content.config.ts)   # KB collection + frontmatter schema
    kb/<category>/<slug>.md       # the practices — one file per practice
  lib/                            # pure functions, folder-by-usage, unit-tested
    articles/  categories/  severity/  format/  search/  scroll/  theme/  skills/
  components/                     # Astro components + Lit islands (with .locators.ts)
  layouts/                        # BaseLayout
  pages/                          # home, /kb (browse + filter), /c/[category], /kb/[...id], skills, about
  styles/                         # tokens.css + global.css (duotone, light/dark)
e2e/                              # Playwright specs (event-driven, no timeouts)
docs/                             # ARTICLE-TEMPLATE.md, SKILLS-PROPOSAL.md
```

## Add a practice

1. Create `src/content/kb/<category>/<slug>.md`.
2. Fill the frontmatter and the required `##` sections — see
   [`docs/ARTICLE-TEMPLATE.md`](docs/ARTICLE-TEMPLATE.md) for the exact shape, the severity
   scale, and the global slug index for cross-links.
3. `bun run build` validates the frontmatter against the schema; `bun run test:e2e` checks
   the site still renders.

## Deploy

Live on **GitHub Pages**: https://igor-ganov.github.io/blog/

It deploys automatically on every push to `main` via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). A `verify` gate runs first —
Biome lint, unit tests, and a full Playwright pass — and `build`/`deploy` only run if it is
green (pull requests run `verify` only). Then build with bun → upload → `actions/deploy-pages`. Because Pages serves the site from the `/blog` subpath, the build
sets `base: '/blog'` in [`astro.config.mjs`](astro.config.mjs); internal links go through
`withBase` (`src/lib/url/with-base.ts`) and a build-time [`rehype-base.mjs`](rehype-base.mjs)
plugin that prefixes in-prose `/kb/...` links. For a custom domain, change `site`/`base` to
the root and the prefixing becomes a no-op.

Static output, so any static host works too. A Cloudflare Workers static-assets config is
also provided ([`wrangler.jsonc`](wrangler.jsonc)):

```bash
bun run build
bun run deploy     # wrangler deploy (needs CLOUDFLARE_* credentials configured)
```

See [`docs/SKILLS-PROPOSAL.md`](docs/SKILLS-PROPOSAL.md) for the proposed skill system and
[`CONTRIBUTING.md`](CONTRIBUTING.md) for how to use and extend this with other developers.
