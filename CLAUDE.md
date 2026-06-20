# Project instructions

A living knowledge base of engineering practices, rendered as a blog (Astro 5 + Lit,
strict TypeScript, functional core). See `CONTRIBUTING.md` and `docs/ARTICLE-TEMPLATE.md`.

## Writing articles — no LLM smells (mandatory)

Articles live in `src/content` (`kb/` reference + `blog/` essays). Any prose written or
edited here MUST read as human-written, not machine-generated.

- Before drafting or editing an article, load the global **`llm-smells`** skill and write
  to its catalogue. The cadence layer (triads, balanced antithesis, dramatic em-dashes,
  aphoristic closers, question-headings, self-referential flourishes) matters most — a
  regex cannot catch it, so it is on you.
- After every Write/Edit of a Markdown file under `src/content`, run the linter on it and
  fix all error-level findings before moving on:

  ```bash
  bun run scripts/llm-smell.ts <file>   # or: bun run lint:prose  (whole tree)
  ```

  A `PostToolUse` hook in `.claude/settings.json` runs this automatically and blocks on
  smells. If the hook is not active yet (it loads after `/hooks` is opened once or a
  restart), run the command yourself — do not skip it.

- The CI bar is `bun run lint && bun run lint:prose && bun run build && bun run test && bun run test:e2e`.
