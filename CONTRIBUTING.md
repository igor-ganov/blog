# Using and extending this knowledge base

This is a shareable reference for other developers. You are welcome to read it, adopt the
practices, disagree with them, and extend it.

## How to read it

- Start with the **non-negotiables** on the home page — the rules that are never up for debate.
- Browse by topic, or filter every practice from `/kb`.
- Each article carries **provenance**: the project and date it came from. Weigh a practice
  by its evidence — one backed by a two-day production outage is held more firmly than one
  backed by a single preference.
- When two decisions conflict, the **newer one wins**; the article records both dates.

## Disagreeing well

Disagreement that comes with a better argument is the point. If an article contradicts your
experience, open an issue (or a PR amending the article) that:

1. Names the article and the specific claim.
2. Gives a concrete counter-case or newer evidence — ideally dated.
3. Proposes the revised rule.

A practice changes by adding a **newer, dated source**, not by silently editing history.

## Adding or changing a practice

1. Read [`docs/ARTICLE-TEMPLATE.md`](docs/ARTICLE-TEMPLATE.md) — it defines the frontmatter
   schema, the required `##` sections, the severity scale, and the global slug index.
2. Create or edit `src/content/kb/<category>/<slug>.md`. English only, no emoji. Lead with
   the rule, then the cost of breaking it, then the fix. Prefer real numbers and real
   symptoms over abstractions.
3. Cross-link related practices via `/kb/<category>/<slug>` and the `related` frontmatter.
4. Verify locally:

   ```bash
   bun run build      # validates frontmatter against the schema
   bun run test       # pure-function unit tests
   bun run test:e2e   # site still renders and the islands work
   bun run lint       # Biome
   ```

## House rules this repo follows

The code here is held to the same standards it documents — so contributions should be too:
strict TypeScript (no `any`/`as`/`null`), small pure functions with unit tests, no `if`/
ternary in `src/lib`, event-driven tests with no timeouts or retries, and a clean Biome
pass. The CI bar is `bun run lint && bun run build && bun run test && bun run test:e2e`.
