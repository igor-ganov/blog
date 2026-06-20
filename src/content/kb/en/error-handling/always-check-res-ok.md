---
title: 'Always check res.ok — never fabricate success'
category: error-handling
summary: 'A fetch wrapper that returns {success:true} without inspecting res.ok is lying to its caller; the UI refreshes, shows stale data, and the user spends hours wondering why nothing saves.'
principle: 'Any wrapper around fetch/swFetch must throw on !res.ok; never return {success:true} without checking the response.'
severity: non-negotiable
tags: [error-handling, fetch, service-worker, reliability]
sources:
  - project: 'a content-admin SPA'
    date: 2026-04-29
    note: 'RBAC handlers returned {success:true} while GitHub returned 4xx; throw on !res.ok via ensureOk/okOrThrow'
related:
  - error-handling/never-swallow-errors
  - backend-events/telemetry-never-crashes
order: 2
updated: 2026-04-29
---

A `fetch` call returning a `4xx` or `5xx` does **not** throw. The `Promise` resolves
normally, and only `res.ok` tells you whether the server accepted the request. A wrapper
that ignores this and returns `{ success: true }` is fabricating a success signal out of
a failure, which is [swallowing the error](/kb/error-handling/never-swallow-errors) with
extra steps. The caller believes the write landed, so the UI refreshes and renders the
old state. The user sees nothing wrong, retries, sees nothing wrong again, and eventually
files a report saying "nothing is saving."

The rule is absolute: **any code that wraps `fetch` or `swFetch` must throw on
`!res.ok`** before returning anything to its caller.

## Why this matters

On 2026-04-29 the content-admin SPA's RBAC layer was audited after someone finally pinned
down the symptom: saves silently did nothing. It had been reproducible for an
indeterminate stretch, and the same operations were retried by hand for hours before
anyone escalated.

The cause sat in four handlers covering the critical RBAC surface:

- org membership `PUT`
- team membership `PUT`
- invite `POST`
- revoke `DELETE`

Each handler called the GitHub API via `swFetch`, read no property of the response, and
returned `{ success: true }`. GitHub had been returning `4xx` responses for permission
issues, stale tokens, and malformed payloads, but the service worker reported success on
every call. The UI received that success signal, triggered a re-fetch of the membership
list, and displayed the unchanged state as if everything had applied. The form looked
like it worked while the data never moved.

The same fabricated-success pattern turned up in asset handlers during the same audit
window. File upload, file delete, and bulk operations all returned `{ success: true }`
without inspecting the response, so a CDN `503` or a storage `409` was silently accepted
as a committed write.

The fix had two parts. Every handler gained an explicit `res.ok` check that throws a
typed error carrying the status code and the response body. Then two helpers, `ensureOk`
in `src/sw/rbac/response-ok.ts` and `okOrThrow` in
`src/views/SettingsView/org-invite-api.ts`, moved into the shared layer so future
handlers have a single, auditable call point instead of inlining the check.

A fabricated `{ success: true }` is an implicit `catch (() => {})` on an HTTP failure,
which makes this incident a direct corollary of the never-swallow-errors principle.

## How to apply

### The okOrThrow helper

Centralise the check. Inlining `if (!res.ok) throw ...` in every handler guarantees it
gets missed or varied somewhere, so extract it once.

```ts
// src/views/SettingsView/org-invite-api.ts  (canonical client-side helper)

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    message = `HTTP ${status}`,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/**
 * Asserts res.ok, consuming the body for the error message when it is not.
 * Throws HttpError so callers can distinguish network errors from HTTP errors.
 */
export const okOrThrow = async (res: Response): Promise<Response> => {
  if (res.ok) return res;
  const body = await res.text().catch(() => '(unreadable)');
  throw new HttpError(res.status, body);
};
```

```ts
// src/sw/rbac/response-ok.ts  (service-worker mirror, identical contract)

export const ensureOk = async (res: Response): Promise<Response> => {
  if (res.ok) return res;
  const body = await res.text().catch(() => '(unreadable)');
  throw new HttpError(res.status, body);
};
```

Both share the same contract. They return the `Response` on success so callers can keep
chaining `.json()` or `.text()`, and they throw a typed `HttpError` on failure so callers
can inspect the status in a type-safe catch.

### Wrapping swFetch in a service-worker handler

```ts
// ❌ Before — fabricated success regardless of GitHub's answer.
const handleOrgMembershipPut = async (
  event: ExtendableMessageEvent,
): Promise<void> => {
  const { org, username, role } = event.data;
  await swFetch(`/orgs/${org}/memberships/${username}`, {
    method: 'PUT',
    body: JSON.stringify({ role }),
  });
  event.ports[0].postMessage({ success: true }); // GitHub may have said 422.
};

// ✅ After — throws before the success message is ever sent.
const handleOrgMembershipPut = async (
  event: ExtendableMessageEvent,
): Promise<void> => {
  const { org, username, role } = event.data;
  const res = await swFetch(`/orgs/${org}/memberships/${username}`, {
    method: 'PUT',
    body: JSON.stringify({ role }),
  });
  await ensureOk(res); // throws HttpError if GitHub returned 4xx/5xx
  event.ports[0].postMessage({ success: true });
};
```

The `event.ports[0].postMessage({ success: true })` line is now only reachable when
`ensureOk` did not throw. Any `HttpError` propagates to the SW message handler's top-level
catch, which posts `{ success: false, error: ... }` back to the client.

### Wrapping fetch on the client side

The same discipline applies to non-SW code. Any function that calls `fetch` directly has
to pipe the response through `okOrThrow` before treating it as successful.

```ts
// ❌ Before — no status check; a 403 lands silently.
export const postInvite = async (org: string, email: string): Promise<void> => {
  await fetch(`/api/orgs/${org}/invitations`, {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
};

// ✅ After — okOrThrow throws; the caller's catch surfaces it to the UI.
export const postInvite = async (org: string, email: string): Promise<void> => {
  const res = await fetch(`/api/orgs/${org}/invitations`, {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
  await okOrThrow(res);
};
```

Because `okOrThrow` returns the `Response`, you can chain it inline when you also need
the body:

```ts
const data = await fetch(url)
  .then(okOrThrow)
  .then((res) => res.json() as Promise<InviteResult>);
```

### What the caller must do with the thrown error

Throwing is only half the contract. The caller has to catch `HttpError` and route it
somewhere visible, like a toast, an error ref, or a retry queue, and never an empty catch.
Pair this rule with [never swallow errors](/kb/error-handling/never-swallow-errors).

```ts
// In a Vue component handler:
const handleRevoke = async (username: string): Promise<void> => {
  try {
    await revokeOrgMember(username);
    await refresh();
  } catch (err) {
    // HttpError carries status + body; anything else is unexpected.
    error.value =
      err instanceof HttpError
        ? `Revoke failed (${err.status}): ${err.body}`
        : 'Unexpected error — please retry.';
  }
};
```

## Anti-patterns

```ts
// ❌ Returning a hardcoded success without touching the response at all.
const uploadAsset = async (file: File): Promise<{ success: boolean }> => {
  await swFetch('/assets', { method: 'POST', body: file });
  return { success: true }; // storage may have returned 409 or 503
};

// ❌ Checking ok but silently discarding the failure path.
const deleteAsset = async (id: string): Promise<void> => {
  const res = await swFetch(`/assets/${id}`, { method: 'DELETE' });
  if (res.ok) return;
  // nothing in the else branch — the failure disappears
};

// ❌ Checking status numerically without covering the full 4xx/5xx range.
const patchTeam = async (team: string, data: TeamPatch): Promise<void> => {
  const res = await fetch(`/teams/${team}`, { method: 'PATCH', body: JSON.stringify(data) });
  if (res.status === 404) throw new Error('not found');
  // 403, 422, 500, etc. still return without error
};

// ❌ Swallowing the response entirely by only awaiting the json() branch.
const getRole = async (username: string): Promise<Role> => {
  const res = await swFetch(`/users/${username}/role`);
  return res.json() as Promise<Role>; // json() on a 401 HTML body will throw a parse
                                      // error, not an HttpError — the wrong error leaks
};
```

Each of these produces the same symptom at runtime. The write appears to succeed from the
caller's perspective, the UI re-renders with stale state, and nobody notices the failure
until a user spots that the data did not change, potentially hours later.

## Enforcement

No single lint rule detects "fetch result used without res.ok check" universally, because
the response object is typed as `Response` whether or not you inspect it. What works is
structural enforcement:

1. **Ban inline `!res.ok` checks** — require every handler to call `ensureOk` or
   `okOrThrow`. This makes the call site obvious in code review and makes it easy to
   grep for unguarded usages (`swFetch` calls not followed by `ensureOk`).
2. **Code review gate** — any new handler that calls `fetch` or `swFetch` and returns a
   success value must show the `ensureOk`/`okOrThrow` call; absence is a defect.
3. **Integration tests** — test the 4xx path explicitly: mock the API to return `403`,
   assert that the UI surfaces an error. A test that only covers the happy path misses
   the entire class of bug described here.

## See also

A fabricated `{ success: true }` is the HTTP-specific instance of the general principle
at [never swallow errors](/kb/error-handling/never-swallow-errors). Telemetry helpers
that send analytics fire-and-forget hit the same failure mode, covered in
[telemetry never crashes](/kb/backend-events/telemetry-never-crashes).
