---
title: 'The design phase is not the coding phase'
category: design-ux
summary: 'When a task is about mockups, stay in design-tool space; proposing frameworks at the design stage is a category error that derails the conversation.'
principle: 'At the design/mockup stage, framework rules do not apply — do not propose Angular, Storybook, signals or any code stack; stay in design-tool space (Penpot, tokens, prototypes).'
severity: non-negotiable
tags: [design-ux, penpot, process, design-tokens, workflow]
sources:
  - project: 'a design-stage project'
    date: 2026-04-26
    note: 'no frameworks at the design stage; stay in design-tool space; user rejected Angular/Storybook proposal mid-Penpot task'
related:
  - design-ux/penpot-is-the-design-tool
  - design-ux/distinct-designs-vary-many-axes
  - process/spec-driven-ears-not-user-stories
order: 1
updated: 2026-04-26
---

A project has phases, and the rules that govern one phase do not automatically govern
another. The coding conventions in CLAUDE.md — use Angular, organise by feature, use
signals, set up Storybook — are rules for the **implementation phase**. They say nothing
about the design phase, because at the design phase there is no code yet. Proposing an
Angular workspace when the user is working in Penpot is not "being thorough". It is a
category error that shifts the conversation to a different phase the user has not
requested, wastes their time, and signals that the task description was not read
carefully.

On a design-stage project (2026-04-26) this happened literally: the team was working on a
Penpot mockup task and received a proposal for an Angular workspace + Storybook in
response. The feedback was direct — the Angular rules do exist and are not wrong, but
they are **coding rules**. A design task is not a coding task.

## Why this matters

### The cost of a phase mismatch

When a user says "help me with this mockup in Penpot", they have a specific, bounded
scope in mind: visual design, layout decisions, component variants, colour tokens,
typography, prototype flows. Responding with a framework proposal forces them to either:

- spend time explicitly rejecting it and redirecting the conversation, or
- accept it and end up in the wrong phase for the work they actually need.

Either outcome is a failure. The first wastes their time. The second derails the
project by pulling premature implementation decisions into a stage where they cannot yet
be informed by the real constraints of the design.

Design decisions and implementation decisions depend on each other, but they are made
separately. The design phase determines what to build — layout, visual hierarchy,
interaction model, component boundaries as visual concepts. The coding phase determines
how to implement it. Collapsing the two forces implementation choices before the design
is stable, which is how you end up with a component that looks wrong but cannot be
changed because it is already wired into a state management graph.

### The trigger words

A task containing any of the following is a design task, not a coding task, until
explicitly told otherwise:

- mockup / wireframe / prototype
- design (when used as a noun for the artefact, not the system)
- Penpot / Figma (including transliterations the team uses for the local self-hosted Penpot instance)
- tokens (design tokens, not auth tokens)
- component in Penpot

If these words appear, the response scope is: design concepts, design-tool capabilities,
visual decisions. Code enters the conversation only when the user explicitly asks for it.

## How to apply

When a design task arrives, work entirely within the design tool's domain:

**Typography**
Discuss typeface choice, weight and size scales, line-height and letter-spacing, optical
sizing, variable font axes. Deliver: a recommended type scale table, W3C design token
JSON for the scale, or a Penpot-importable token file.

**Colour**
Discuss palette construction (primary, semantic, neutral, error), contrast ratios,
dark/light mode token structure, brand constraints. Deliver: a W3C design token JSON
file with the palette, or a flat list of CSS custom properties ready to paste.

**Layout and density**
Discuss grid systems (8-point, 4-point), spacing scales, breakpoint strategy, container
widths, information density. Deliver: a spacing token table, a grid spec, annotated
layout sketches in prose.

**Component variants**
Discuss Penpot component structure (main component + variants), prop axes (size, state,
emphasis), auto-layout behaviour, nested component patterns. Deliver: a spec of the
variant grid — which axes, which values per axis, how they compose — and SVG assets if
requested.

**Prototype and interaction**
Discuss flow connections in Penpot, transition types (instant, dissolve, slide), delay
values, scroll behaviour, fixed/sticky overlays, interaction hotspots. Deliver: a
description of the prototype wiring, or drive Penpot directly via the browser MCP.

```jsonc
// Example: W3C design tokens for a type scale — the correct deliverable
// for a typography design task; NOT a TypeScript type, NOT a Storybook story.
{
  "typography": {
    "scale": {
      "xs":   { "$value": "0.75rem",  "$type": "dimension" },
      "sm":   { "$value": "0.875rem", "$type": "dimension" },
      "base": { "$value": "1rem",     "$type": "dimension" },
      "lg":   { "$value": "1.125rem", "$type": "dimension" },
      "xl":   { "$value": "1.25rem",  "$type": "dimension" },
      "2xl":  { "$value": "1.5rem",   "$type": "dimension" },
      "3xl":  { "$value": "1.875rem", "$type": "dimension" },
      "4xl":  { "$value": "2.25rem",  "$type": "dimension" }
    },
    "weight": {
      "regular": { "$value": 400, "$type": "fontWeight" },
      "medium":  { "$value": 500, "$type": "fontWeight" },
      "semibold":{ "$value": 600, "$type": "fontWeight" },
      "bold":    { "$value": 700, "$type": "fontWeight" }
    }
  }
}
```

Notice what is absent: no Angular module, no Storybook story, no interface definition,
no component decorator. Those belong to the implementation phase. At the design phase,
a token file and a layout spec are complete, correct deliverables.

### Transition to code — only on request

The design phase ends when the user explicitly signals it: "OK, now let's build this",
"generate the component", "start the Angular project". At that point, and only at that
point, the coding conventions apply. Until then, keep all responses inside design-tool
space.

If a design artefact (a token file, a component spec) will need an implementation
counterpart, it is fine to **note** that in one sentence — "when you are ready to
implement, these tokens map directly to CSS custom properties" — but do not expand it
into a framework proposal or a file structure until asked.

## Anti-patterns

The following responses to a Penpot mockup task are all wrong, regardless of technical
correctness:

```
// Anti-pattern 1: Proposing a framework workspace
// Trigger: "help me design this mockup in Penpot"
// Wrong response: "Let's set up an Angular workspace with Storybook so we can develop
//                  the components in isolation..."
// Why wrong: the user is in Penpot; no code exists; a workspace is phase-2 work.

// Anti-pattern 2: Delivering a TypeScript interface instead of a token file
// Trigger: "define the colour tokens for the brand"
// Wrong response: export interface BrandTokens { primary: string; secondary: string; }
// Right response: a W3C design token JSON file with the palette values.

// Anti-pattern 3: Recommending a component library at the design stage
// Trigger: "how should I structure the card component variants in Penpot?"
// Wrong response: "Angular Material has a card component; you can use that as the basis."
// Why wrong: Angular Material is an implementation; the user is designing, not building.

// Anti-pattern 4: Generating Storybook stories for a design spec
// Trigger: "spec out the button variants"
// Wrong response: a .stories.ts file
// Right response: a table of variant axes (size × emphasis × state) with visual notes.
```

## Enforcement

This is enforced by reading comprehension, not by a linter. The check is: does the
task description contain any of the design-phase trigger words listed above? If yes,
restrict the response to design-tool space until a coding request arrives explicitly.
In pull request review, if a response to a design task contains a framework import or
a workspace scaffold, that response was wrong regardless of technical quality.

## See also

[Penpot is the design tool](/kb/design-ux/penpot-is-the-design-tool) — specifics of
working with a local self-hosted Penpot instance and how to interact with it directly.

[Distinct designs vary many axes](/kb/design-ux/distinct-designs-vary-many-axes) — what
a substantive design response looks like when design directions are requested, as opposed
to the framework proposal anti-pattern.
