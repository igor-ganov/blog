---
title: "Don't SSR custom elements on the edge — hydrate on the client"
category: web-components
summary: 'Do not server-render Lit on Cloudflare Workers; the Workers runtime has no HTMLElement and the @astrojs/lit SSR renderer crashes. Load components via a client <script> import instead.'
principle: 'Do not server-render Lit on Cloudflare Workers; load components via a client <script> import. The Workers runtime has no HTMLElement and the @astrojs/lit SSR renderer crashes.'
severity: strong
tags: [lit, web-components, astro, cloudflare-workers, ssr, islands]
sources:
  - project: 'a Jira client app'
    date: 2026-06-08
    note: '@astrojs/lit SSR crashes the Workers runtime (HTMLElement is not defined); load via client script.'
related:
  - build-ci-deploy/build-time-env-is-baked
  - web-components/lit-functional-core
  - web-components/lit-legacy-decorators-no-accessor
order: 5
updated: 2026-06-10
---

Cloudflare Workers is not a browser. It does not expose `HTMLElement`, `customElements`,
or any of the Web Components APIs. The `@astrojs/lit` integration attempts to render
Lit components on the server using `@lit-labs/ssr`, which depends on a DOM polyfill.
When the SSR renderer runs inside a Cloudflare Worker, it reaches for `HTMLElement` and
immediately throws `ReferenceError: HTMLElement is not defined`. The worker returns HTTP
500 before any HTML reaches the client.

This is not a version-specific bug or a configuration oversight. It is an architectural
mismatch: Cloudflare Workers deliberately excludes the browser DOM surface. Lit's SSR
path requires it. They cannot coexist.

A Jira client app (2026-06-08) encountered this the first time a Lit component was
added to an Astro site deployed to Cloudflare Workers. The `@astrojs/lit` integration
was registered in `astro.config.ts`, the component was used with `client:load`, and
every edge request resulted in a 500 until the integration was removed and the component
was loaded via a plain `<script type="module">` import instead.

## Why this matters

The `@astrojs/lit` integration exists for a reason: it serialises Lit component HTML on
the server so the user sees content before JavaScript loads (progressive enhancement).
On a Node.js server or in Astro's static output mode, this works. On the edge it does
not, and there is no workaround short of replacing Cloudflare Workers with a Node.js
runtime.

The failure is total, not degraded. A missing `HTMLElement` polyfill does not cause the
component to render without styles — it throws synchronously during module initialisation
when `@lit-labs/ssr` is imported. Every request crashes. There is no fallback.

A secondary issue compounds this in the same project: Astro's `astro:env` secret variables are
validated at module initialisation time. If the secrets are not present in the worker
environment (because they were not bound in the Cloudflare dashboard), the validation
throws at startup before any request is served. The worker 500s until the secrets are
configured. This is separate from the Lit issue but follows the same pattern: anything
that runs at module init on the edge must be resilient to a missing runtime environment.
See [build-time env is baked](/kb/build-ci-deploy/build-time-env-is-baked) for the
related constraint on static build-time env vars.

## How to apply

**Remove `@astrojs/lit` from the Astro config.** This is the only required change for
the worker crash. Do not pass it to `integrations`.

```ts
// astro.config.ts — before (crashes the Workers runtime)
import { defineConfig } from 'astro/config';
import lit from '@astrojs/lit';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  output: 'server',
  adapter: cloudflare(),
  integrations: [
    lit(),  // ← remove this entirely
  ],
});
```

```ts
// astro.config.ts — after
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  output: 'server',
  adapter: cloudflare(),
  integrations: [],
});
```

**Load Lit components via a client `<script>` import.** The component definition runs
in the browser, where `HTMLElement` exists. There is no SSR step, so the edge runtime
never sees the Lit code.

```astro
---
// src/pages/dashboard.astro — no Lit import in the frontmatter
---

<html>
  <head>
    <!-- The component script runs only in the browser -->
    <script>
      import '@/components/jira-board.js';
      import '@/components/sprint-filter.js';
    </script>
  </head>
  <body>
    <!-- Custom element used as plain HTML; JS upgrades it on the client -->
    <jira-board project="ENG" sprint="current"></jira-board>
  </body>
</html>
```

For TypeScript awareness of the custom element in the `.astro` file, declare the
element type in a `.d.ts` file rather than importing the element module directly:

```ts
// src/env.d.ts
/// <reference types="astro/client" />

declare namespace JSX {
  interface IntrinsicElements {
    'jira-board': { project?: string; sprint?: string };
    'sprint-filter': { value?: string };
  }
}
```

**Static output avoids the problem entirely.** If the site does not require per-request
server rendering, set `output: 'static'`. Astro renders everything to HTML at build
time and the Cloudflare Worker serves static files. Lit components load on the client
and none of the runtime constraints apply. This blog follows that pattern: `output:
'static'`, Lit islands loaded by client script, no `@astrojs/lit`.

```ts
// astro.config.ts — static output, Cloudflare serves flat files
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  output: 'static',          // no SSR, no edge runtime constraints
  adapter: cloudflare(),     // deploys to Cloudflare Pages
});
```

**If you need per-request rendering** on the edge and want Lit components to have
meaningful initial HTML, the available options are:

1. Render the component's initial state as plain semantic HTML in the Astro template
   and use the Lit component purely as an enhancement layer. The custom element upgrades
   what is already there rather than replacing blank markup.

2. Move SSR rendering to a Cloudflare Worker that runs Node.js-compatible code via the
   `nodejs_compat` compatibility flag, then use `@lit-labs/ssr` there. This is a
   significant infrastructure change and is only warranted if the SEO or TTFB benefit is
   measurable.

For most applications the client-script island pattern is sufficient. Components load in
a few hundred milliseconds on a modern connection, which is imperceptible for
interactive UI that is only visible after user action anyway.

## Anti-patterns

```ts
// ❌ Registering @astrojs/lit with a Cloudflare Workers adapter.
//    Every edge request returns HTTP 500: "HTMLElement is not defined".
export default defineConfig({
  output: 'server',
  adapter: cloudflare(),
  integrations: [lit()],
});
```

```astro
---
// ❌ Importing a Lit component in the Astro frontmatter.
//    The frontmatter runs on the server (the edge worker).
//    The import triggers @lit-labs/ssr which throws immediately.
import JiraBoard from '@/components/jira-board.js';
---
<JiraBoard project="ENG" client:load />
```

```ts
// ❌ Validating secrets at module init without a try/catch.
//    If the Cloudflare secret binding is missing, this throws at startup
//    and the worker 500s before any request is handled.
import { JIRA_TOKEN } from 'astro:env/server'; // throws if unset
```

## Enforcement

If the project uses Cloudflare Workers as its adapter, a CI check can assert that
`@astrojs/lit` is not in the dependency tree and not referenced in `astro.config.ts`.
A simple grep in the pipeline is sufficient:

```bash
grep -r '@astrojs/lit' astro.config.ts package.json && \
  echo "ERROR: @astrojs/lit must not be used with Cloudflare Workers adapter" && \
  exit 1 || exit 0
```

Pair this with the `output: 'static'` default in the Astro config wherever the site
does not require per-request server logic. Static output eliminates the entire class of
edge runtime compatibility bugs.

## See also

The Lit components loaded via client script rely on the decorator configuration
described in [Lit legacy decorators — never the accessor keyword](/kb/web-components/lit-legacy-decorators-no-accessor)
and follow the shell/core split from
[A Lit element is a thin shell over a pure core](/kb/web-components/lit-functional-core).
The `astro:env` startup crash is the edge-runtime face of the broader constraint
covered in [build-time env is baked](/kb/build-ci-deploy/build-time-env-is-baked).
