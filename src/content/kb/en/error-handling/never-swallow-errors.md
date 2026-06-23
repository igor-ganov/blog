---
title: 'Never swallow an error'
category: error-handling
summary: 'Empty catches and fabricated success hide the exact failures that cause production incidents. Errors propagate or are handled explicitly — never silenced.'
principle: 'No empty catch, no `.catch(() => {})`, no fabricated success. Either filter the error class explicitly and rethrow the rest, or route the rejection somewhere it is seen.'
severity: non-negotiable
tags: [error-handling, reliability, observability]
sources:
  - project: 'a content-admin SPA'
    date: 2026-05-09
    note: 'Silent catch handlers were the structural reason a class of save regressions stayed invisible; banned via biome noEmptyBlockStatements.'
  - project: 'a content-admin SPA'
    date: 2026-04-29
    note: 'RBAC handlers returned {success:true} while GitHub returned 4xx — saves silently did nothing for hours.'
related:
  - error-handling/always-check-res-ok
  - error-handling/no-self-rolled-yaml
  - functional-architecture/errors-as-values-with-effect
  - platform/idb-structured-clone-boundary
order: 1
updated: 2026-05-09
---

An empty catch is the most expensive line of code you can write, because it goes
invisible at exactly the moment you need it. `.catch(() => {})` does not handle an
error. It deletes the evidence that one occurred. The failure still happened, and now
no log, no notification, and no test will ever see it. On a content-admin SPA this
played out for real: silent catch handlers were the **structural reason** an entire
class of production save-regressions stayed invisible until a human noticed, by hand,
that nothing was saving.

The rule: **never silently swallow an error.** Empty `try/catch`, `.catch(() => {})`,
`.catch(() => undefined)`, and `.then(onOk, () => {})` are all banned.

## Why this matters

Two incidents, same root cause.

The content-admin SPA would commit unbuildable repository state. The static content
site's build then failed, but the admin-side error path swallowed every signal, so the
editor saw success while production went red. The same shape sat under service-worker
init, where `.then(loadRoleAfterInit, () => {})` discarded SW startup failures.

Separately, the RBAC layer (org-membership `PUT`, team `PUT`, invite `POST`, revoke
`DELETE`) returned `{ success: true }` from the service worker **while GitHub had
returned a 4xx**. The handler never checked `res.ok`, so it fabricated success, the UI
refreshed, and it showed the old state. Saves silently did nothing, and nobody knew
until hours of retrying. A fabricated success is just a swallowed error that smiles
back at you.

The cost is the same in both cases. The failure is real, but it surfaces as a
confusing symptom far from the cause, usually only after a human notices. You pay in
debugging hours, and you pay in lost trust about whatever you thought you saved.

## How to apply

Decide, explicitly, what you are doing with the rejection. There are exactly three
legitimate choices, and "nothing" is not one of them.

**1. Genuine fire-and-forget → forward the rejection.** If you really do not want to
await something, do not drop its failure. Route it to the global handler so it stays
observable.

```ts
// src/utils/fire-and-forward.ts — rejections reach `unhandledrejection`.
export const fireAndForward = (p: Promise<unknown>): void => {
  void p.catch((error) => {
    globalThis.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', { reason: error, promise: p }));
  });
};
// In a service worker, the equivalent logs with a category: fireAndLog(p, 'sw-init').
```

**2. Selective swallow → filter the class, rethrow the rest.** "Ignore EEXIST, propagate
everything else" is legitimate; "ignore everything" is not. Make the unwanted branch
keep propagating.

```ts
// Idempotent mkdir: only EEXIST is expected.
export const ensureDir = async (path: string): Promise<void> => {
  try {
    await mkdir(path);
  } catch (error) {
    void (isEexist(error) ? 0 : rethrow(error)); // anything else still throws
  }
};
```

**3. Handle it for real.** Show the user the error, retry with backoff, or queue it. The
point is that the error reaches code that does something with it.

For fallible logic that runs often, prefer making errors **values** instead of throws:
an `Either`/`Effect` whose error channel the type system forces you to address. See
[errors as values with Effect](/principles/functional-architecture/errors-as-values-with-effect).

## Anti-patterns

```ts
// ❌ The empty catch — deletes evidence.
try {
  await save();
} catch {}

// ❌ Fire-and-forget that forgets the failure too.
void appendEntry(entry); // throws inside? nobody will ever know

// ❌ Fabricated success — the SW says ok while the API said no.
const res = await fetch(url, { method: 'PUT' });
return { success: true }; // never checked res.ok — see "always check res.ok"

// ❌ The two-argument then with a no-op rejection handler.
init().then(loadRole, () => {});
```

## Enforcement

`biome lint/suspicious/noEmptyBlockStatements` is set to **error** (it is on in this
repo's own `biome.json`), which bans empty `try/catch` outright. The ESLint equivalent
is `no-empty` with `allowEmptyCatch: false`. The fabricated-success variant is caught by
the companion rule [always check `res.ok`](/principles/error-handling/always-check-res-ok). When
you find a `${key}: ${value}` template literal or a `.catch(() => {})` in review, treat
it as a defect rather than a style nit.

## See also

The same instinct, never letting a failure pass unseen, drives
[always check res.ok](/principles/error-handling/always-check-res-ok) and the refusal to
[hand-roll fragile serializers](/principles/error-handling/no-self-rolled-yaml) that fail
silently on hostile input.
