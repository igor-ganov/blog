# `lib/` — the functional core

Small pure functions, **one export per file**, organised by usage rather than by layer.
Every function here is framework-agnostic and unit-tested (`*.test.ts` colocated), so the
Astro pages and Lit islands stay a thin imperative shell over this core.

Conventions (the same ones documented in the KB):

- No `if`/ternary for control flow — `switch`, strategy lookup maps (`Record<Key, Fn>`),
  or `??` for value defaults.
- No `any`, no `as`, no `null`; `readonly` inputs and outputs.
- A file does one thing; the filename is the function name.

Folders:

- `articles/` — the `Article` view model, mapping from the collection, grouping, sorting,
  provenance helpers, and a test fixture.
- `categories/` — the single source of category metadata + a Map lookup.
- `severity/`, `format/`, `search/`, `scroll/`, `theme/` — leaf utilities used by the
  components and islands.
- `skills/` — data + presentation for the proposed skill system on `/skills`.
