---
title: 'Immutable assets must carry a content hash'
category: build-ci-deploy
summary: 'Any asset served with long immutable cache headers must have a content hash in its filename; stripping the hash for specific files causes browsers to serve stale assets indefinitely.'
principle: 'Any asset served with long immutable cache headers must have a content hash in its filename; never strip the hash for specific files.'
severity: strong
tags: [build, vite, caching, css, assets, cache-control]
sources:
  - project: 'a content-admin SPA'
    date: 2026-03-14
    note: 'unhashed style.css cached forever under immutable → visual regression; use [name]-[hash]'
related:
  - build-ci-deploy/build-time-env-is-baked
order: 2
updated: 2026-03-14
---

`Cache-Control: max-age=31536000, immutable` tells every browser and CDN layer between
the server and the user: "this URL will never change; cache it forever; never revalidate."
That instruction is only correct when the URL itself encodes the content. The content hash
in `style-DBEI2-Wo.css` is the content. If the file changes, Vite produces a different
hash, the URL changes, and the old cached version is never requested again.

Remove the hash and the URL becomes `style.css`. The file changes on every deploy. The
browser has a cached copy under `Cache-Control: immutable` and never asks for a new one.
The user sees yesterday's CSS applied to today's HTML until the browser cache is manually
cleared — a window that can span weeks depending on the user's browsing patterns.

## Why this matters

**A content-admin SPA, 2026-03-14.**

A build configuration change introduced a custom `assetFileNames` function to rename
certain output files for easier identification in the CDN access logs. For most files the
function returned the default pattern including the hash. For stylesheet assets it returned
a simplified name without the hash:

```ts
// vite.config.ts — the configuration that caused the incident
build: {
  rollupOptions: {
    output: {
      assetFileNames: (assetInfo) => {
        // intended to make logs readable — instead broke cache busting
        if (assetInfo.name?.endsWith('.css')) {
          return 'assets/[name][extname]'; // ← no [hash]
        }
        return 'assets/[name]-[hash][extname]';
      },
    },
  },
},
```

The CDN was configured with:

```
Cache-Control: max-age=31536000, immutable
```

for everything under `/assets/`. This is the correct header for content-hashed files.
Applied to `style.css` it became a permanent cache entry for a mutable file.

The deploy on 2026-03-14 added new UI components with their own CSS classes. Users who
had visited the admin panel in the previous week had `style.css` cached from the prior
build. Their browsers did not request the new file. The new HTML referenced classes that
did not exist in the cached CSS. The result: new components rendered with no styles — a
critical visual regression that blocked the UI's primary workflow.

The fix was a one-line change to the `assetFileNames` pattern and a CDN cache purge to
evict the stale `style.css` entries that had already been distributed.

## How to apply

### Use the default Vite hash pattern for all assets

```ts
// vite.config.ts

// ❌ Custom function that strips the hash for stylesheets
build: {
  rollupOptions: {
    output: {
      assetFileNames: (assetInfo) => {
        if (assetInfo.name?.endsWith('.css')) {
          return 'assets/[name][extname]';      // no hash — immutable cache poison
        }
        return 'assets/[name]-[hash][extname]'; // hash present for everything else
      },
    },
  },
},

// ✅ Uniform pattern — hash present for all assets
build: {
  rollupOptions: {
    output: {
      assetFileNames: 'assets/[name]-[hash][extname]',
    },
  },
},
```

If a string pattern is used instead of a function, the `[hash]` token cannot be
accidentally omitted for a subset of files.

### Astro projects

Astro delegates asset hashing to Vite. The relevant config key is `build.assets` for the
output directory, not the filename pattern. Astro's default filename output already
includes the content hash; do not override `vite.build.rollupOptions.output.assetFileNames`
unless you are certain the override preserves `[hash]`.

```ts
// astro.config.mjs

// ✅ Default — Astro + Vite hash assets automatically, no override needed
export default defineConfig({
  build: {
    assets: '_assets', // only the directory name; hashing is untouched
  },
});

// ❌ Risky — overriding assetFileNames; verify [hash] is present
export default defineConfig({
  vite: {
    build: {
      rollupOptions: {
        output: {
          assetFileNames: '_assets/[name][extname]', // missing [hash]
        },
      },
    },
  },
});
```

### Verify the output before deploying

After `vite build` or `astro build`, check the `dist/assets/` directory:

```sh
ls dist/assets/*.css
# ✅ Expected: dist/assets/style-DBEI2-Wo.css
# ❌ Wrong:    dist/assets/style.css
```

If any CSS or JS file lacks a hash segment in its name, the build configuration is wrong.
Do not deploy under immutable cache headers without correcting it.

### CDN cache purge after fixing a stale-asset incident

When a hash-less file has already been distributed under immutable headers, fixing the
build config is not enough. Existing CDN cache entries must be purged:

```sh
# Cloudflare — purge by URL (or purge everything if the domain is small)
curl -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/purge_cache" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"files":["https://example.com/assets/style.css"]}'
```

End users who have the file in their local browser cache cannot be reached by a CDN
purge. They will continue to see the stale version until their browser cache expires
(which, under `immutable`, is effectively never) or they hard-refresh. This is the
inherent cost of the misconfiguration; it cannot be fully remediated after the fact.

## Anti-patterns

```ts
// ❌ Stripping hash from a specific extension
assetFileNames: (info) =>
  info.name?.endsWith('.css')
    ? 'assets/[name][extname]'       // immutable + no hash = permanent staleness
    : 'assets/[name]-[hash][extname]',

// ❌ Stripping hash for "stable" filenames to ease log reading
assetFileNames: 'assets/[name][extname]',
// Symptom: every asset is served stale after the next deploy to any user
// who visited before. Visual regressions that are invisible in dev (no immutable).

// ❌ Serving assets with immutable headers from a directory that also
//    contains hash-less files (e.g. robots.txt, favicon.ico)
// Symptom: favicon.ico cached forever; updating it has no effect for existing users.
//
// Fix: put only hashed assets under the immutable path; serve root-level
// static files with a short max-age and no immutable flag.
```

## Enforcement

1. **Post-build filename check in CI.** Add a step that fails if any file under
   `dist/assets/` lacks a hash segment:

   ```sh
   # Fails if any CSS or JS output file has no hash in its name
   find dist/assets -name '*.css' -o -name '*.js' | while read f; do
     basename "$f" | grep -qE '\-[A-Za-z0-9]{6,}\.' || {
       echo "Missing hash in asset filename: $f"
       exit 1
     }
   done
   ```

2. **String pattern, not a function.** Use `assetFileNames: 'assets/[name]-[hash][extname]'`
   as a plain string. A function requires reading every branch to verify hash presence; a
   string makes the guarantee visible at a glance.

3. **Code review checklist.** Any PR that modifies `vite.config.ts` or `astro.config.mjs`
   and touches `assetFileNames` or `rollupOptions.output` must be reviewed for `[hash]`
   presence before merge.
