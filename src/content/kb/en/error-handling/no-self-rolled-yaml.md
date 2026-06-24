---
title: 'Never hand-roll a YAML or frontmatter serializer'
category: error-handling
summary: 'Template-literal YAML serializers silently corrupt files containing colons — a two-day production outage on a content-admin SPA proved that only a real library handles hostile input safely.'
principle: 'Use a battle-tested library (yaml by eemeli) for parse/stringify; never a ${key}: ${value} template or a line.split(":") parser, even for a quick utility.'
severity: strong
tags: [error-handling, yaml, frontmatter, reliability, content-pipeline]
sources:
  - project: 'a content-admin SPA'
    date: 2026-05-05
    note: 'self-rolled frontmatter serializers broke on colons; took prod red 2 days; replaced with yaml lib, lineWidth:0'
related:
  - error-handling/never-swallow-errors
  - build-ci-deploy/crlf-lf-discipline
  - build-ci-deploy/restore-prod-first-incident-order
order: 3
updated: 2026-05-05
---

YAML has nineteen special characters. A template literal knows about none of them. Every
hand-rolled `${key}: ${value}` serializer works fine until someone types a colon in a
title, a quotation mark in a summary, or a pound sign in a tag, and then it emits
structurally broken YAML that a downstream parser reads as multiple keys, an unquoted
block scalar, or a comment. Nothing complains at write time. The blow-up happens at read
time, usually in CI or in a browser, where the stack trace points at the parser instead
of the template string that produced the file.

So: never write a YAML or frontmatter serializer by hand. Use
[`yaml`](https://github.com/eemeli/yaml) (the `eemeli/yaml` package) and let it quote,
escape, and wrap values for you.

## Why this matters

On 2026-05-05 a content-admin SPA went red in production for two days, then recurred the
next day on a different file.

Two separate utilities wrote frontmatter to content files:

- `src/utils/frontmatter` — the admin UI's client-side helper
- `src/sw/handlers/shared/frontmatter` — the service-worker handler used by bulk
  operations

Both used the same shape of template literal:

```ts
// the exact pattern that was in production
const serialize = (fields: Record<string, unknown>): string =>
  Object.entries(fields)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
```

The serializer emitted `${key}: ${value}` with no quoting, no escaping, and no awareness
of YAML syntax at all. That works for `title: My Post`. It falls apart the moment a value
contains a special character.

What triggered it: an Italian article with the phrase **"predatoria: ha"** in its summary
field, and a Russian article whose title contained a colon followed by quoted text. Both
have a colon followed by a space, which is the YAML mapping indicator. The serializer
emitted:

```yaml
summary: La risposta predatoria: ha portato il progetto
```

A conforming YAML parser reads this as two keys: `summary` with value `La risposta
predatoria`, then an attempt to parse `ha portato il progetto` as a bare mapping key.
Depending on the parser's error recovery mode, that either throws a parse error or
silently drops the continuation. The static content site's build consumed this file,
failed to parse the frontmatter, and halted. Production went red.

PR #189 fixed it. It replaced both utilities with `yaml.parse` / `yaml.stringify` from
the `eemeli/yaml` package, added `lineWidth: 0` to keep prose values on one line (the
downstream regex-based tooling expects single-line frontmatter values), and introduced
`parseFrontmatterStrict`, a stage-time guard that parses every file before committing so
unparseable YAML never reaches git. The next-day recurrence came from a file already
committed before the fix deployed; the guard would have caught it at write time.

The same incident turned up a second problem. The reader half of the old utility used
`line.split(':')[1]` to extract values, which returns the wrong result for any value
containing a colon and truncates the field silently instead of throwing.

## How to apply

### Install the library

```sh
bun add yaml
```

The `yaml` package (npm: `yaml`, eemeli/yaml on GitHub) is the reference pure-JS YAML
1.2 implementation. It handles all nineteen special characters, multi-line strings, and
Unicode for you.

### Serialize frontmatter

```ts
// ❌ Before — template-literal serializer, zero quoting.
const serializeFrontmatter = (fields: Record<string, unknown>): string => {
  const body = Object.entries(fields)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
  return `---\n${body}\n---`;
};

// ✅ After — yaml.stringify handles all hostile input.
import { stringify } from 'yaml';

const serializeFrontmatter = (fields: Record<string, unknown>): string => {
  // lineWidth: 0 keeps every scalar on one line;
  // downstream regex tooling must not see hard-wrapped prose.
  const body = stringify(fields, { lineWidth: 0 }).trimEnd();
  return `---\n${body}\n---`;
};
```

With `lineWidth: 0`, a value like `La risposta predatoria: ha portato il progetto`
becomes:

```yaml
summary: 'La risposta predatoria: ha portato il progetto'
```

The library auto-quotes strings that need it. You never decide when to add quotes; the
library decides.

### Parse frontmatter

```ts
// ❌ Before — split-on-colon reader, silently truncates values with colons.
const parseFrontmatter = (raw: string): Record<string, string> => {
  const block = raw.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
  return Object.fromEntries(
    block.split('\n').map((line) => {
      const [key, ...rest] = line.split(':');
      return [key.trim(), rest.join(':').trim()]; // re-joining is already a workaround
    }),
  );
};

// ✅ After — yaml.parse handles all YAML including colons, quotes, multi-line.
import { parse } from 'yaml';

const parseFrontmatter = (raw: string): Record<string, unknown> => {
  const block = raw.match(/^---\n([\s\S]*?)\n---/)?.[1];
  if (block === undefined) throw new Error('No frontmatter block found');
  return parse(block) as Record<string, unknown>;
};
```

### Add a stage-time guard

Validate every file before writing it to disk or committing it. Here is the guard that
was missing before PR #189:

```ts
// src/utils/frontmatter/parse-strict.ts
import { parse } from 'yaml';

/**
 * Parses frontmatter and throws with a clear message if the YAML is invalid.
 * Call this at write time so unparseable content never reaches git.
 */
export const parseFrontmatterStrict = (raw: string): Record<string, unknown> => {
  const block = raw.match(/^---\n([\s\S]*?)\n---/)?.[1];
  if (block === undefined) {
    throw new Error('parseFrontmatterStrict: no frontmatter block in file');
  }
  try {
    const result = parse(block);
    if (typeof result !== 'object' || result === null) {
      throw new TypeError('Parsed value is not an object');
    }
    return result as Record<string, unknown>;
  } catch (cause) {
    throw new Error(`parseFrontmatterStrict: invalid YAML — ${String(cause)}`, { cause });
  }
};
```

Wire this into the save path, not the display path. If `parseFrontmatterStrict` throws,
surface the error to the editor before anything gets written.

### CRLF note

YAML parsers interpret `\r\n` line endings differently from `\r\n`-agnostic tools, so
normalise line endings to `\n` before handing content to the parser or the serializer.
See [CRLF/LF discipline](/principles/build-ci-deploy/crlf-lf-discipline).

```ts
const normalise = (raw: string): string => raw.replace(/\r\n/g, '\n');
const block = normalise(raw).match(/^---\n([\s\S]*?)\n---/)?.[1];
```

## Anti-patterns

```ts
// ❌ Template-literal serializer — breaks on colon, quote, #, |, >, ampersand, ...
const bad = (fields: Record<string, unknown>): string =>
  Object.entries(fields)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

// Produces this for a title containing a colon and quoted text:
// title: "Some title": continuation
// ↑ parser reads "Some title" as the value and : continuation as a syntax error

// ❌ Split-on-colon reader — silently truncates any value containing a colon.
const badParse = (line: string): [string, string] => {
  const [key, value] = line.split(':');
  return [key.trim(), value?.trim() ?? ''];
  // For `date: 2026-05-05T12:00:00Z` this produces value = `2026-05-05T12`
};

// ❌ JSON.stringify as a YAML value — produces unquoted JSON objects or arrays
//    that are valid JSON but not always valid YAML scalars.
const alsoWrong = (tags: string[]): string =>
  `tags: ${JSON.stringify(tags)}`; // emits tags: ["a","b"] — valid YAML list? maybe.
                                   // emits tags: ["a:b","c"] — definitely not.

// ❌ Catching parse errors and silently returning an empty object — the caller
//    thinks the file has no frontmatter and overwrites it with defaults.
const silentFail = (raw: string): Record<string, unknown> => {
  try {
    return parse(raw);
  } catch {
    return {}; // wrong: caller proceeds with an empty record, destroys the file
  }
};
```

In each case the file is written successfully, with no error at write time. Later the
downstream build or parser chokes on the corrupted output, and the stack trace points at
the parser rather than at the serializer that produced the bad data.

## Enforcement

1. **Ban the pattern in review.** A template literal of the form `` `${key}: ${value}` ``
   in a utility that handles file content is a defect. Treat it as one in code review.
2. **Grep gate in CI.** A pre-commit hook or CI step can fail on the pattern:
   ```sh
   # Fails if any file in src/utils or src/sw/handlers matches the antipattern.
   grep -rn '\`\${.*}: \${' src/utils src/sw/handlers && exit 1 || exit 0
   ```
3. **parseFrontmatterStrict at write time.** The stage-time guard described above catches
   any corruption — from whatever source — before it reaches git.

## See also

The instinct that produces hand-rolled YAML serializers is the same one that produces
[swallowed errors](/principles/error-handling/never-swallow-errors) in the catch path. Both start
as "it is just a quick utility" shortcuts and end as multi-day production incidents. This
colon incident triggered [restore-prod-first incident order](/principles/build-ci-deploy/restore-prod-first-incident-order),
since the team had to triage while production was red.
