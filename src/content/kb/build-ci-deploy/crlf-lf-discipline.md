---
title: 'CRLF/LF discipline: normalize before regex, enforce eol=lf'
category: build-ci-deploy
summary: 'On Windows-dev to Linux-CI, enforce eol=lf via .gitattributes and normalize CRLF to LF before any regex parsing; CRLF input to a \\n-literal regex silently returns wrong results, not an error.'
principle: 'On Windows-dev → Linux-CI, enforce eol=lf via .gitattributes and normalize CRLF→LF before any regex parsing; expect "LF will be replaced by CRLF" warnings.'
severity: strong
tags: [git, crlf, lf, line-endings, regex, windows, ci, parsing]
sources:
  - project: 'a static content site'
    date: 2026-04-12
    note: 'CRLF broke a \\n-literal regex → wiped metadata; normalize before regex'
  - project: 'a multi-package monorepo'
    date: 2026-04-11
    note: '.gitattributes eol=lf'
related:
  - error-handling/no-self-rolled-yaml
  - build-ci-deploy/standalone-submodule-ci
order: 4
updated: 2026-04-12
---

Windows uses `\r\n` (CRLF) as its line ending. Linux uses `\n` (LF). Git's `text=auto`
mode converts line endings on checkout to the platform default and back to LF on commit —
unless you override it. The mismatch between a Windows developer machine and a Linux CI
runner is one of the oldest cross-platform hazards in software development, and it still
bites in 2026 because the failure mode is **silent wrong results**, not an error.

A regex written with a literal `\n` boundary matches perfectly on LF input. On CRLF
input, the `\n` is preceded by `\r` and the boundary does not match where expected. The
regex returns no match, or matches a reduced range, or returns an empty capture group.
No exception is thrown. The caller receives a wrong result and proceeds.

## Why this matters

**A static content site, 2026-04-12.**

A content pipeline utility parsed frontmatter from Markdown files using a regex with
literal `\n` characters:

```ts
// src/utils/frontmatter/parse.ts — the exact regex before the fix
const parseFrontmatter = (raw: string): Record<string, string> => {
  const block = raw.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
  return Object.fromEntries(
    block.split('\n').map((line) => {
      const [key, ...rest] = line.split(':');
      return [key.trim(), rest.join(':').trim()];
    }),
  );
};
```

On Linux (CI and production) the files had LF endings and the function worked correctly.
On the developer's Windows machine, files saved by the editor had CRLF endings. The regex
`/^---\n([\s\S]*?)\n---/` did not match because the actual delimiter was `\r\n`, not `\n`.

The result: `block` was `''` (empty string from the `?? ''` fallback). The function
returned `{}` — an empty object — as the parsed frontmatter. This empty object was then
written back to the file by the save pipeline. The file's frontmatter was replaced with
`---\n\n---\n\n<original body>`, wiping every metadata field.

The file appeared to save successfully. No error was thrown at any point. The wiped
metadata was only discovered when the public site build failed because required frontmatter
fields were absent. The edited article was restored from git history.

**A multi-package monorepo, 2026-04-11.**

The same pattern — Windows development, Linux CI — caused biome and tsc to report
inconsistent errors depending on which platform ran the check. Adding `.gitattributes`
with `* text=auto eol=lf` normalized all files to LF in the git object store and
eliminated the divergence. See [standalone-submodule-ci](/kb/build-ci-deploy/standalone-submodule-ci).

## How to apply

### 1. Add .gitattributes to every repo

```gitattributes
# .gitattributes
* text=auto eol=lf
```

This instructs git to:
- Store all text files as LF in the object store (on commit).
- Check out all text files as LF on every platform, including Windows.

After adding this file to an existing repo, re-normalize the working tree:

```sh
git add --renormalize .
git commit -m "normalize line endings to LF"
```

The `--renormalize` flag re-applies the `.gitattributes` rules to every tracked file
without changing its content semantically.

### 2. Expect "LF will be replaced by CRLF" warnings — they are correct

On Windows, after adding `eol=lf`, git will emit warnings when you stage files:

```
warning: LF will be replaced by CRLF in src/some-file.ts.
The file will have its original line endings in your working tree
```

This warning is correct behavior in a `text=auto eol=lf` repo: git is telling you that
your working-tree copy will have CRLF (because Windows), but the stored blob will be LF.
**Do not suppress or work around this warning.** It confirms the attribute is working.

### 3. Normalize CRLF to LF before any regex that contains \n

Any function that parses text content received from disk, the network, or an editor
must normalize line endings before applying regex or string-split operations:

```ts
// ❌ Before — regex breaks silently on CRLF input
const parseFrontmatter = (raw: string): Record<string, string> => {
  const block = raw.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
  // On CRLF input: block is '' — no error, wrong result, metadata wiped
  return parseBlock(block);
};

// ✅ After — normalize first, then parse
const normalizeLineEndings = (s: string): string => s.replace(/\r\n/g, '\n');

const parseFrontmatter = (raw: string): Record<string, string> => {
  const normalized = normalizeLineEndings(raw);
  const block = normalized.match(/^---\n([\s\S]*?)\n---/)?.[1];
  if (block === undefined) throw new Error('No frontmatter block found');
  return parseBlock(block);
};
```

The normalization step has no cost on LF-only input (`\r\n` does not appear, replace is
a no-op). It is always safe to call.

### 4. Apply normalization at the I/O boundary, not at each use site

The correct place to normalize is when the string enters the system — when reading from
disk, receiving a network response, or accepting editor input. Internal functions then
receive an already-normalized string and do not need to handle both cases.

```ts
// src/fs/read-file.ts
import { readFile } from 'node:fs/promises';

export const readTextFile = async (path: string): Promise<string> => {
  const raw = await readFile(path, 'utf8');
  return raw.replace(/\r\n/g, '\n'); // normalize once at the boundary
};

// Internal callers receive LF-only strings; no per-function normalization needed
```

This mirrors the [validate-at-the-boundary](/kb/typescript/validate-at-the-boundary)
principle applied to line endings: normalize once at the entry point, trust the
normalized form internally.

### 5. .editorconfig to prevent editors from writing CRLF

Add an `.editorconfig` file to reinforce the `eol=lf` intent at the editor level:

```ini
# .editorconfig
root = true

[*]
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true
```

Most editors (VS Code, JetBrains, Vim) respect `.editorconfig` automatically. This
reduces the frequency of CRLF-ending files being staged in the first place.

## Anti-patterns

```ts
// ❌ Regex with \n on potentially CRLF input — silent wrong result
const match = content.match(/^---\n([\s\S]*?)\n---/);
// On CRLF: match is null or wrong; downstream proceeds with undefined/empty result.

// ❌ Fallback that hides the failure
const block = content.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
// On CRLF: block is ''; caller receives {} from parseBlock(''); overwrites metadata.

// ❌ String split on \n without normalizing
const lines = content.split('\n');
// On CRLF: each line ends with \r; trim() catches it, but key/value comparisons fail.
// Example: lines[0] === 'title: My Post\r' → key is 'title' ✓ but value is 'My Post\r'
//          value.trim() fixes the display but not equality checks: value !== 'My Post'
```

```gitattributes
# ❌ No .gitattributes — git uses platform default line endings
# On Windows checkout: files are CRLF. CI sees CRLF in committed files.
# Result: lint tools report CRLF warnings; regex parsers fail silently.

# ❌ text=auto without eol=lf — LF on Linux, CRLF on Windows
* text=auto
# On Windows developer machine: working tree is CRLF, git object is LF.
# After normalization commit the repo is consistent, but the CRLF warning
# and per-machine behavior make it harder to reason about.
```

## Enforcement

1. **`.gitattributes` presence check in CI.**

   ```sh
   [ -f .gitattributes ] || { echo ".gitattributes missing"; exit 1; }
   grep -q 'eol=lf' .gitattributes || { echo ".gitattributes missing eol=lf"; exit 1; }
   ```

2. **Biome formatter enforces LF.** With `"formatter": { "lineEnding": "lf" }` in
   `biome.json`, `bunx biome ci .` fails if any file has CRLF line endings. This catches
   any CRLF files that were committed before `.gitattributes` was added.

   ```json
   {
     "formatter": {
       "enabled": true,
       "lineEnding": "lf"
     }
   }
   ```

3. **Normalization at I/O boundary** (described above) ensures even if a CRLF file
   escapes both git and Biome checks, the parsing logic produces correct results.

## See also

The silent-wrong-result failure mode of CRLF in regex is the same category as
[never hand-roll a YAML parser](/kb/error-handling/no-self-rolled-yaml): the code appears
to work, no error is thrown, and the corruption only surfaces downstream when the
wrong result is consumed. Both incidents affected the same content pipeline on the same
day (2026-04-12).
