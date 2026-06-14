---
title: 'secret-manager: one-time secrets over Telegram'
description: 'A new little tool — a Telegram bot that turns a value into a link that opens exactly once. This is the announcement and the build notes: one domain running on two runtimes, links that survive link previews, and the Telegram constraints that shaped every decision.'
date: 2026-06-14
tags: [product, platform, security]
order: 7
---

New tool, deliberately small: [**secret-manager**](https://github.com/igor-ganov/secret-manager),
live as [@secret_manager_bot](https://t.me/secret_manager_bot). Send it a value;
it replies with a link that reveals that value **exactly once** and then answers
`410 Gone` forever. No account, no app — a Telegram chat is the whole interface.

It is the kind of utility you reach for when you need to pass a password or an API
key to someone and refuse to leave it sitting in chat history. The fun was never the
feature; it was making "once" honestly mean once on a platform that fights you on it.

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

The whole point of the architecture is that the business logic doesn't know where it
runs. Storage is expressed as three small ports — `OneTimeLinkStore`, `SecretStore`,
`PendingSetStore` — each with two adapters, wired up at the entry point and nowhere
else. It is the [functional core / imperative shell](/essays/functional-core-imperative-shell)
split, made concrete: closures over classes, dependencies injected, the core handed
its effects rather than reaching for them.

- **Locally** (`main.ts`): long-polling bot, `bun:sqlite`, one-time tokens held in
  memory, `Bun.serve` for the link server.
- **In production** (`worker.ts`): a Cloudflare Worker on webhooks, with D1 backing
  everything — secrets, links, and the conversational state.

Same `createBot`, same link handler, two compositions. The in-memory token store
even doubles as a design statement: a restart invalidates every outstanding link,
which for a secret-sharer is the *safe* failure mode, not a regression.

## Making "once" actually mean once

Three decisions carry the guarantee:

- **Unguessable tokens.** Each is two `crypto.randomUUID()` values concatenated with
  the dashes stripped — 256 bits of randomness, far past brute-forcing the URL space.
- **Atomic read-and-destroy.** Consume is a single `DELETE … RETURNING value`. The
  row is gone in the same statement that returns it, so a link can't be served twice
  even if two requests race for it. No read-then-delete window to lose.
- **The reveal is a POST, not a GET.** This one cost a bug to learn. The first cut
  consumed the secret on `GET /s/<token>` — and the very first GET belongs to
  Telegram's link-preview crawler, which fetches the URL to build a chat card
  milliseconds after the message is sent. Every link died at age zero, burned by a
  thumbnail nobody asked for. It is the textbook [**GET that mutates**](/essays/security-bugs-by-type)
  bug class, arriving through a chat client instead of a mail prefetcher. Now `GET`
  serves a non-destructive confirmation page with a **Reveal secret** button, and
  only the `POST` behind it runs the consume. Crawlers, antivirus scanners, and
  safe-link rewriters get the door; only a real click opens it.

A convenience fell out of that last decision for free: because the reveal is a plain
POST to a stable URL, no browser is required. The bot ships a copy-ready
`curl -X POST <link>` next to every link, so a script can fetch and spend a secret in
one line.

## Telegram's edges shaped the design

Half the interesting decisions are downstream of one platform limit: **callback data
is capped at 64 bytes.** That single number drives:

- **62-byte keys.** Two bytes go to a one-character action prefix (`g:`, `s:`, `d:`,
  `D:`), leaving 62 for the key, validated by actual UTF-8 byte length, not character
  count. Over-long keys are rejected with a clear message rather than silently
  truncated into a collision.
- **A compact callback encoding.** Inline-keyboard buttons can't carry a JSON blob, so
  actions are encoded as a tiny prefix plus the key and parsed back into a typed
  discriminated union — the keyboard speaks five bytes, the handler speaks types.

Two more platform-shaped choices:

- **Conversational state needs a home.** "Press *set*, then send me the new value" is a
  two-message exchange, so a `pending_sets` table (or an in-memory map locally) remembers
  the half-finished intent between updates.
- **The worker learns its own origin.** Generated links need an absolute URL, but the
  Worker reads its public origin straight from the incoming request — so production
  needs no `BASE_URL` configuration at all, and the same code serves any domain you put
  in front of it.

## Hygiene that came cheap

The secret page is rendered with HTML escaping at the injection point and shipped with
`no-store`, `noindex`, and `no-referrer` headers — the value never lands in a cache, a
search index, or a referer leak to the next hop. None of it was expensive; it was just
a matter of deciding the threat model before writing the handler instead of after.

## Try it

Open [@secret_manager_bot](https://t.me/secret_manager_bot), send it a value, share
the link. The code is on [GitHub](https://github.com/igor-ganov/secret-manager) — Bun,
grammY, strict TypeScript with no escape hatches, and the same ports-and-adapters split
this post describes. It is small on purpose; the discipline is in the corners.
