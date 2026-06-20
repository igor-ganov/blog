---
title: 'secret-manager: one-time secrets over Telegram'
description: 'A new little tool — a Telegram bot that turns a value into a link that opens exactly once. This is the announcement and the build notes: one domain running on two runtimes, links that survive link previews, and the Telegram constraints that shaped every decision.'
date: 2026-06-14
tags: [product, platform, security]
order: 7
---

New tool, deliberately small: [**secret-manager**](https://github.com/igor-ganov/secret-manager),
live as [@secret_manager_bot](https://t.me/secret_manager_bot). Send it a value and
it replies with a link that reveals that value **exactly once**, then answers
`410 Gone` forever after. There's no account and no app to install; a Telegram chat is
the whole interface.

You reach for this when you need to hand a password or an API key to someone without
leaving it sitting in chat history. The feature itself was easy. The interesting part
was making "once" honestly mean once on a platform that fights you on it.

## What it does

- Send a bare `value` → a one-time link, **nothing stored**.
- Send `key value` → the pair is saved to your Telegram account *and* you get a
  one-time link to the value.
- **List** (button or `/list`) manages saved keys, each row offering **get** (a fresh
  one-time link), **set** (overwrite the value), and **✕** (delete behind a confirm).
- Every link lives five minutes (configurable) and opens once. Secrets are scoped to
  your Telegram user id — a composite `(user_id, key)` primary key — so no two users
  ever see each other's keys.

## One domain, two runtimes

The architecture exists so the business logic doesn't know where it runs. Storage is
three small ports, `OneTimeLinkStore`, `SecretStore`, and `PendingSetStore`, each with
two adapters wired up at the entry point and nowhere else. This is the
[functional core / imperative shell](/essays/functional-core-imperative-shell) split
made concrete: closures over classes, dependencies injected, the core handed its
effects instead of reaching for them.

- **Locally** (`main.ts`): long-polling bot, `bun:sqlite`, one-time tokens held in
  memory, `Bun.serve` for the link server.
- **In production** (`worker.ts`): a Cloudflare Worker on webhooks, with D1 backing
  everything — secrets, links, and the conversational state.

Same `createBot`, same link handler, two compositions. The in-memory token store has a
nice property: a restart invalidates every outstanding link. For a secret-sharer that's
the *safe* failure mode, so I left it as is.

## Making "once" actually mean once

Three decisions carry the guarantee.

- **Unguessable tokens.** Each is two `crypto.randomUUID()` values concatenated with
  the dashes stripped, 256 bits of randomness, far past brute-forcing the URL space.
- **Atomic read-and-destroy.** Consume is a single `DELETE … RETURNING value`. The
  row is gone in the same statement that returns it, so a link can't be served twice
  even when two requests race for it. There's no read-then-delete window to lose.
- **The reveal is a POST, not a GET.** This one cost a bug to learn. The first cut
  consumed the secret on `GET /s/<token>`, and the very first GET belongs to
  Telegram's link-preview crawler, which fetches the URL to build a chat card
  milliseconds after the message is sent. Every link died at age zero, burned by a
  thumbnail nobody asked for. That's the textbook [**GET that mutates**](/essays/security-bugs-by-type)
  bug class, arriving through a chat client instead of a mail prefetcher. Now `GET`
  serves a non-destructive confirmation page with a **Reveal secret** button, and
  only the `POST` behind it runs the consume. Crawlers, antivirus scanners, and
  safe-link rewriters get the door; only a real click opens it.

That last decision handed over a convenience too. Because the reveal is a plain POST to
a stable URL, no browser is required. The bot ships a copy-ready `curl -X POST <link>`
next to every link, so a script can fetch and spend a secret in one line.

## Telegram's edges shaped the design

Half the interesting decisions are downstream of one platform limit: **callback data
is capped at 64 bytes.** That single number drives a few things.

- **62-byte keys.** Two bytes go to a one-character action prefix (`g:`, `s:`, `d:`,
  `D:`), which leaves 62 for the key, validated by actual UTF-8 byte length rather than
  character count. Over-long keys get rejected with a clear message instead of being
  silently truncated into a collision.
- **A compact callback encoding.** Inline-keyboard buttons can't carry a JSON blob, so
  actions are encoded as a tiny prefix plus the key, then parsed back into a typed
  discriminated union. The keyboard speaks five bytes and the handler speaks types.

Two more choices the platform shaped.

- **Conversational state needs a home.** "Press *set*, then send me the new value" is a
  two-message exchange, so a `pending_sets` table (or an in-memory map locally) remembers
  the half-finished intent between updates.
- **The worker learns its own origin.** Generated links need an absolute URL, and the
  Worker reads its public origin straight from the incoming request. Production needs no
  `BASE_URL` configuration at all, and the same code serves whatever domain you put in
  front of it.

## Hygiene that came cheap

The secret page is rendered with HTML escaping at the injection point and shipped with
`no-store`, `noindex`, and `no-referrer` headers, so the value never lands in a cache, a
search index, or a referer leak to the next hop. None of it cost much. I decided the
threat model before writing the handler instead of after, and the rest followed.

## Try it

Open [@secret_manager_bot](https://t.me/secret_manager_bot), send it a value, share
the link. The code is on [GitHub](https://github.com/igor-ganov/secret-manager): Bun,
grammY, strict TypeScript with no escape hatches, and the same ports-and-adapters split
this post describes. It's small on purpose, and the discipline lives in the corners.
