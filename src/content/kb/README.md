# `kb/` — the knowledge base content

One Markdown file per practice, foldered by category: `kb/<category>/<slug>.md`. The file
`id` (e.g. `error-handling/never-swallow-errors`) is the route (`/principles/<id>`) and the
cross-link target.

- Frontmatter is validated by [`../../content.config.ts`](../../content.config.ts) — an
  invalid file fails the build.
- The authoring format (frontmatter fields, required `##` sections, severity scale, slug
  index) lives in [`../../../docs/ARTICLE-TEMPLATE.md`](../../../docs/ARTICLE-TEMPLATE.md).
- Categories and their metadata are defined once in
  [`../../lib/categories/categories.ts`](../../lib/categories/categories.ts).

Each practice carries **provenance** (`sources: [{ project, date, note }]`). Dates are the
mechanism for "newer overrides older": when practices conflict, the article cites both
dates and states which one stands.
