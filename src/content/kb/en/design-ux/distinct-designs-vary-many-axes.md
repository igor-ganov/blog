---
title: 'Distinct designs vary many axes — recoloring is not redesigning'
category: design-ux
summary: 'Six design variants that share one layout and swap only CSS custom properties are one design, not six. Distinct directions need their own shell, typography, imagery model, and interaction metaphor.'
principle: 'When asked for distinct design directions, vary layout & density, real typography (load actual distinctive fonts), color philosophy, imagery treatment, interaction model and product metaphor — each direction gets its own page/shell, not a token preset.'
severity: strong
tags: [design-ux, design-variants, typography, layout, prototyping, penpot]
sources:
  - project: 'a real-estate listings site'
    date: 2026-05-12
    note: '6 variants too similar — only token swaps; distinct directions vary layout/type/color/imagery/interaction/metaphor, own shell each'
related:
  - design-ux/minimalism-no-emoji-schematic
  - design-ux/design-phase-is-not-code-phase
  - process/spec-driven-ears-not-user-stories
order: 2
updated: 2026-05-12
---

Ask for "six design directions" and you're asking for six genuinely different answers to
"what could this product be?" You're not asking for one layout with six different
`--color-primary` values, and the gap between those two things isn't a matter of taste. A
direction is a design hypothesis about what the product is for, who it's for, and what
using it feels like. Recolouring leaves the hypothesis untouched. It just changes the paint.

On a real-estate listings site (2026-05-12) I shipped six design variants for a listing
platform. All six shared the same `MarketShell` component tree, the same information
architecture, the same density, the same type scale, and the same components. They differed
only in CSS custom properties driven by `data-material`, `data-shape`, and `data-palette`
attributes. The feedback came back: disgustingly similar. Which is the right reaction to
six variants that are structurally the same thing.

The second round got accepted. Three prototypes, each self-contained, each a different
answer to "what is this product":

- A magazine direction: a magazine model, Fraunces + Spectral, article-style
  listings, editorial photo treatment, reading rhythm chosen over scanning density.
- A map-first direction: MapLibre GL as the primary surface, listings as sidebar
  overlays, a geographic metaphor, the city itself as the interface.
- A bento-marketplace direction: a low-density bento grid, neo-brutalist-lite, high
  contrast, bold cut typography, a market-stall metaphor.

Different shells, different fonts, different information architectures, different product
metaphors. That's what "distinct directions" buys you.

## Why this matters

### A token swap does not constitute a design decision

CSS custom properties exist for theming inside a single design system. Press them into
service generating "design alternatives" and you've inverted their purpose. When a component
uses `color: var(--color-primary)`, flipping `--color-primary` from indigo to coral answers
no design question; it repaints the surface while every substantive decision (layout,
hierarchy, metaphor, density, interaction model) stays put. Someone comparing six such
variants learns nothing about the range of possibilities open to them, only which colours the
tool happens to know.

### The axes that actually matter

A design direction is fixed by where it sits on all of these at once. Vary only one of them
(usually colour) and the direction stays undefined:

**Layout model** — Is content a vertical feed, a map, a grid, a magazine spread, a
dashboard, a single-focus canvas? Each one implies a different user intent and a different
information architecture.

**Density** — How much shows on one screen without scrolling? High density (data tables,
dashboards) points at one kind of audience and use case; low density (editorial, hero-first
landing pages) points at another.

**Typography** — The typeface isn't decoration. It carries personality, sets the reading
rhythm, and signals register. A display serif (Fraunces, Playfair Display) reads completely
differently from a geometric sans (DM Sans, Plus Jakarta) or a monospace-influenced hybrid.
Load real fonts. Don't write "use a serif" in a comment and then render everything in
system-sans.

**Colour philosophy** — A near-monochrome palette with one accent behaves nothing like a
full-spectrum palette, a duotone, or a dark-mode-first palette with neon accents. The
philosophy also covers the role of white space, how you handle tint and shade, and the
relationship between background and foreground density.

**Imagery treatment** — Full-bleed photography, cropped thumbnail grids, illustrated icons,
map tiles, data visualisations, schematic line art, no images at all: each answers "what is
the product's visual register?" differently. The imagery treatment is what the product feels
like at a glance.

**Interaction model and product metaphor** — What's the primary verb? Browse, search, map,
curate, compare, read? The metaphor (marketplace, magazine, atlas, dashboard, tool) shapes
every downstream call about layout and interaction. Two products with the same data but
different metaphors look nothing alike.

## How to apply

When a request for N distinct directions lands, write N design hypotheses as prose first,
one sentence each, before you touch any tooling. Each hypothesis names the metaphor, the
primary audience posture, and the signature typographic choice. If the hypotheses don't read
as clearly different from each other on the page, the designs won't be different either.

```
// Example for a real estate platform:

// Direction 1 — magazine direction
// Metaphor: magazine about living. Audience posture: reader.
// Font: Fraunces (display serif, optical size) + Spectral (body).
// Layout: article-width columns, editorial photo bleeds, byline-style listing metadata.
// Density: low — one listing occupies the screen; scroll to advance.

// Direction 2 — map-first direction
// Metaphor: geographic exploration. Audience posture: navigator.
// Font: DM Mono (coordinates/labels) + DM Sans (UI).
// Layout: map as primary surface (100vw × 100vh), listings as drawer/sidebar overlay.
// Density: adaptive — map is full-bleed; listing panel slides in on selection.

// Direction 3 — bento-marketplace grid
// Metaphor: market stall. Audience posture: browser.
// Font: Unbounded (display, neo-brutalist weight contrast) + Space Grotesk (body).
// Layout: unequal bento grid, feature card + satellite cards, hard borders.
// Density: medium — several listings visible; emphasis via card size, not colour.
```

Once the hypotheses are distinct, build each prototype as a self-contained page: its own
`<head>` with its own font imports, its own global stylesheet (no shared reset or layout
shell), its own component structure, its own imagery. Nothing gets themed through
data-attributes on a shared layout component.

### What a self-contained prototype looks like

```html
<!-- magazine-direction/index.html — owns its entire head -->
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Listings — magazine direction</title>
  <!-- Specific to this direction; not shared with other prototypes -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,600&family=Spectral:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="./editorial.css">
</head>
<body>
  <!-- Own markup structure — not a shared MarketShell with a data-theme attribute -->
  <article class="listing-feature">
    <figure class="listing-feature__image">...</figure>
    <div class="listing-feature__body">
      <p class="listing-feature__eyebrow">District · Gs 850.000.000</p>
      <h1 class="listing-feature__headline">Casa con jardín en barrio residencial</h1>
      ...
    </div>
  </article>
</body>
</html>
```

Set that against the anti-pattern:

```html
<!-- WRONG — one shell, swapped via data-palette; this is not a separate direction -->
<body data-palette="editorial" data-shape="rounded" data-material="light">
  <market-shell>...</market-shell>
</body>
```

### Typography: load actual fonts

Skip system fonts for design exploration unless a direction specifically asks for them.
Load real, distinctive fonts from Google Fonts, Bunny Fonts, or local files. The rendering
gap between Fraunces at `optical-sizing: auto` and a system sans-serif isn't subtle; it's
the whole register of the design. A prototype without real fonts is a wireframe.

Make the font choice load-bearing and specific for every prototype. If the direction is
"neo-brutalist market", the font isn't "a bold sans". It's Unbounded, or Space Grotesk, or
Monument Extended. Name the font, load the font, render with the font.

## Anti-patterns

**Token preset as direction**

Six `<body data-theme="X">` variants are one design. Rename "direction 1–6" to "theme 1–6"
and tell the user straight that you built a theme switcher, not a design exploration. Don't
pass a theme preset off as a direction.

**Identical layout with different accent colours**

If every direction shares the same card component, grid columns, navigation structure,
header height, and footer, varying only the accent colour, they aren't distinct directions.
Accent colour is the least informative axis you have.

**"Font: sans-serif" in the CSS**

`font-family: sans-serif` in a prototype for a direction described as "modern, clean,
geometric" is a placeholder, not a design choice. It means the typography axis went
unvaried, so the direction is under-specified. Load the font.

**Density uniformity across directions**

Six directions all showing the same 16-item grid at 1200px wide tells you density never
moved. Glance at a high-density direction and a low-density one side by side at real viewport
size, and they should feel genuinely different.

## See also

[Minimalism: no emoji, schematic, duotone](/principles/design-ux/minimalism-no-emoji-schematic) —
the specific visual philosophy that applies once a direction is confirmed, including
the concrete lesson from removing stat chips and extra modules from the bento-marketplace
prototype after it felt like a spam site.

[The design phase is not the coding phase](/principles/design-ux/design-phase-is-not-code-phase) —
the upstream rule: when producing design directions, stay in design-tool space; do not
let the multi-direction brief trigger a multi-workspace scaffold.
