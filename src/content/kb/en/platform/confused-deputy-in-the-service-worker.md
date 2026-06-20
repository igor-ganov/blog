---
title: 'A Service Worker holding a token is a confused deputy'
category: platform
summary: 'A SW (or any in-page broker) that executes privileged operations with a stored credential must re-check the caller''s authorization on every privileged route — UI-level gating is not a security boundary.'
principle: 'Every privileged handler behind a stored credential re-derives the caller''s role and rejects before acting; the check lives in the handler, not in the UI that calls it.'
severity: strong
tags: [platform, service-worker, rbac, confused-deputy, security]
sources:
  - project: 'a content-admin SPA'
    date: 2026-06-11
    note: 'SW routes for org-role change and org invitations executed with the stored admin token and no role check; roles-config routes in the same codebase had the gate. Any same-origin script could self-promote to admin.'
related:
  - platform/proxy-must-pin-targets
  - platform/sanitize-html-before-injection
order: 7
updated: 2026-06-11
---

A Service Worker acting as a backend-for-frontend ends up holding the user's token;
it has no choice, that is its job. Routes inside it then execute GitHub API calls
with that token. Here is the failure mode that is easy to miss. The SW serves
*every* script running on the origin, not only the well-behaved UI components you
wrote. A privileged route that trusts its caller can be driven by any same-origin
script, whether that is an XSS foothold, a compromised dependency, or a browser
extension with page access.

That is the classic confused deputy: a component with authority (the token)
performing actions on behalf of a caller with less authority, without checking.

On a content-admin SPA (2026-06-11) the audit found three SW routes executing with
the stored admin token and **no role check**: `POST /api/github/org-role` (change
anyone's role), `POST /api/github/org-invite`, and the invite revoke. The roles-config
routes *in the same directory* did have the check. So the pattern already existed, it
just never got applied to the newer handlers. One
`fetch('/api/github/org-role', {method: 'POST', body: '{"login":"me","role":"admin"}'})`
from any same-origin context turns the whole RBAC model into decoration.

## How to apply

One shared gate, called first in every privileged handler:

```ts
export const requireAdmin = (): Response | undefined => {
  const username = workerState.config?.username
  const role = username ? resolveRole(username) : undefined
  return role === 'admin' ? undefined : errorResponse('Admin only', 403)
}

// In each privileged handler:
return requireAdmin() ?? performPrivilegedThing(cfg, body)
```

The `??` shape keeps the handler declarative: the gate returns a 403 `Response` or
`undefined`, and the real work only runs once the gate passes.

Two design points matter more than the snippet:

- **The check re-derives authorization from state the caller cannot set.** Here the
  role resolves from the org's roles file and the org-admin cache. It never reads a
  request field or anything postMessage can carry.
- **GitHub still enforces token scopes underneath.** The SW gate is defence in
  depth. Its job is to turn "any XSS means org takeover" into "XSS is contained to
  what the current user could already do anyway", which is the entire reason roles
  exist.

## Anti-patterns

```ts
// "Only the admin UI calls this route."
// The SW cannot know that. Every same-origin script is a caller.
export const handleSetRole = async (request: Request) =>
  applyRole(cfg.owner, cfg.token, await request.json())

// Checking in the component instead of the handler:
v-if="role === 'admin'" // hides the button; the route still answers anyone
```

Symptom: nothing, until someone hostile finds it. Privilege checks that live only in
templates produce no errors and no logs, so the audit finding is usually the first
signal you get.

## Enforcement

A unit test per privileged route asserting 403 for a non-admin caller and success
for an admin, with the GitHub call mocked and asserted **not called** in the reject
path. Grep-level review rule: every handler that reads `config.token` must either
call the gate or carry a comment explaining why it is public.
