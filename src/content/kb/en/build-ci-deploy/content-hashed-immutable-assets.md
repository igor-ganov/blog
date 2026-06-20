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

`Cache-Control: max-age=31536000, immutable` is a promise to every browser and CDN layer
between the server and the user: this URL will never change, so cache it forever and never
revalidate. The promise only holds when the URL encodes the content. The hash in
`style-DBEI2-Wo.css` is what makes that true. Change the file and Vite emits a different
hash, so the URL changes and the old cached copy is never requested again.

Strip the hash and the URL collapses to `style.css`, which now changes on every deploy
while the browser holds a copy under `immutable` and refuses to ask for a new one. The
user gets yesterday's CSS painted onto today's HTML until they manually clear the cache,
and depending on how often they browse, that window can run for weeks.

## Why this matters

**A content-admin SPA, 2026-03-14.**

A build config change added a custom `assetFileNames` function to rename certain output
files so they were easier to spot in the CDN access logs. Most files kept the default
pattern with the hash. Stylesheets got a simplified name with the hash dropped:

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

for everything under `/assets/`. That is the right header for content-hashed files.
Applied to `style.css`, it turned into a permanent cache entry for a file that keeps
changing.

The 2026-03-14 deploy added new UI components with their own CSS classes. Anyone who had
visited the admin panel in the previous week already had `style.css` cached from the
prior build, so their browsers never requested the new file. The fresh HTML referenced
classes that did not exist in the cached CSS, and the new components rendered with no
styles at all. That visual regression blocked the panel's primary workflow.

Fixing it took a one-line change to the `assetFileNames` pattern plus a CDN cache purge to
evict the stale `style.css` entries that had already gone out.

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

A string pattern instead of a function makes it impossible to drop the `[hash]` token for
some subset of files by accident.

### Astro projects

Astro hands asset hashing to Vite. The `build.assets` key sets the output directory, not
the filename pattern, and Astro's default output already includes the content hash. Don't
override `vite.build.rollupOptions.output.assetFileNames` unless you are sure the override
keeps `[hash]`.

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

A CSS or JS file with no hash segment in its name means the build config is wrong. Correct
it before you deploy anything under immutable cache headers.

### CDN cache purge after fixing a stale-asset incident

Once a hash-less file has gone out under immutable headers, fixing the build config does
nothing for copies already in flight. You have to purge the existing CDN cache entries:

```sh
# Cloudflare — purge by URL (or purge everything if the domain is small)
curl -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/purge_cache" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"files":["https://example.com/assets/style.css"]}'
```

A CDN purge can't reach end users who already hold the file in their local browser cache.
They keep seeing the stale version until their browser cache expires (under `immutable`,
that is effectively never) or they hard-refresh. That is the cost baked into the
misconfiguration, and you can't fully undo it after the fact.

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
   as a plain string. With a function you have to read every branch to confirm the hash is
   there; the string shows the guarantee at a glance.

3. **Code review checklist.** Any PR that touches `assetFileNames` or `rollupOptions.output`
   in `vite.config.ts` or `astro.config.mjs` gets checked for `[hash]` presence before it
   merges.
