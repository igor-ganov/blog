---
title: About this knowledge base
description: Why this knowledge base exists, how it was built from real project decisions, and how to read it and argue with it.
lede: "A written record of how I build software: the practices and conventions behind my code, architecture, testing, tooling and design. It is here to be used and argued with."
whyHeading: Why it exists
whyIntro: "Four reasons, in order of how much they matter to me:"
why1: <strong>To make the knowledge current.</strong> Practices accumulate across projects as scattered notes. Collecting them in one place, dated and sourced, turns tacit habit into something I can review and keep honest.
why2: <strong>To check that I build the way I intend.</strong> Writing each practice down, with the incident that justifies it, makes it falsifiable. Where an article is wrong or out of date, it can be corrected here, and the correction flows back into how the work is actually done.
why3Pre: <strong>To sharpen the skill system.</strong> These articles are the raw material for a more precise set of reusable skills. See
why3Post: for the proposed shape.
why4: <strong>To share it with other developers.</strong> Everything here is general enough to be useful beyond the project it came from.
builtHeading: How it was built
built: "Every article comes from an actual project decision, not invented for this site. The source material was a global conventions file, six coding-standard skills, and roughly eighty dated notes captured while working across {projects} projects. Those were grouped into {categories} categories and {articles} articles, each with its <em>provenance</em>: which project it came from and when."
newerHeading: Newer decisions override older ones
newerPre: A practice is only as good as its last revision. Where two decisions conflict, the more recent one wins, and the article says so explicitly with both dates. For example, one project removed Effect-TS during a move to a pure SPA on 2026-03-15, then re-adopted it nine days later in a Grand Refactoring on 2026-03-24 — so the standing practice is
newerLink: errors as values with Effect
newerPost: ", and the earlier note is recorded as superseded rather than deleted."
sevHeading: How strongly each practice is held
sevIntro: "Every article carries a severity badge:"
sevNonNeg: never up for debate; violating it is a defect.
sevStrong: the default; deviate only with an explicit, recorded reason.
sevPreferred: the house style; reasonable exceptions exist.
sevContext: situational guidance that depends on the project.
readHeading: How to read it and challenge it
readPre: Start with the
readLink: non-negotiables
readPost: "on the home page, then browse by topic. If an article contradicts your experience, the provenance is there so you can weigh the evidence: a practice backed by a two-day production outage is held more firmly than one backed by a single preference. Disagreement that comes with a better argument is exactly what keeps this current."
builtWithHeading: Built with what it documents
builtWith: The site is built with what it documents. It is an Astro 5 static site with Lit islands loaded client-side (never SSR-rendered on the edge), strict TypeScript with no <code>any</code>/<code>as</code>/<code>null</code>, a functional core of small pure functions unit-tested with Vitest, event-driven Playwright E2E with no timeouts, and Biome enforcing the rules in CI. Each of those is a practice documented here.
---
