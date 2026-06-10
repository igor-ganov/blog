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

When someone asks for "six design directions", they mean six genuinely different answers
to the question "what could this product be?" They do not mean one layout with six
different `--color-primary` values. The difference is not subjective. A direction is a
design hypothesis: a different model of what the product is for, who it is for, and what
using it feels like. Recolouring does not change the hypothesis. It changes the paint.

On a real-estate listings site (2026-05-12) six design variants were delivered for a real
estate listing platform. All six shared the same `MarketShell` component tree, the same
information architecture, the same density, the same type scale, and the same components.
They differed only in CSS custom properties controlled by `data-material`, `data-shape`,
and `data-palette` attributes. The feedback was that they were disgustingly similar.
That is the correct reaction to six variants that are structurally identical.

The second round that was accepted had three prototypes, each self-contained, each a different
answer to "what is this product":

- A magazine direction: a magazine model, Fraunces + Spectral, article-style
  listings, editorial photo treatment, reading rhythm over scanning density.
- A map-first direction: a map-first model, MapLibre GL as the primary surface,
  listings as sidebar overlays, geographic metaphor, the city as the interface.
- A bento-marketplace direction: a low-density bento grid, neo-brutalist-lite, high
  contrast, bold cut typography, market stall metaphor.

Three shells. Three fonts. Three information architectures. Three product metaphors. That
is what "distinct directions" means.

## Why this matters

### A token swap does not constitute a design decision

CSS custom properties exist to allow theming within a single design system. Using them to
generate "design alternatives" inverts their purpose. When a component uses
`color: var(--color-primary)`, changing `--color-primary` from indigo to coral does not
answer any design question — it changes surface appearance while leaving every substantive
decision (layout, hierarchy, metaphor, density, interaction model) identical. A user
comparing six such variants learns nothing about the range of design possibilities. They
learn only what colours the tool knows about.

### The axes that actually matter

A design direction is characterised by its position on all of the following simultaneously.
Varying only one (usually colour) leaves the direction undefined:

**Layout model** — Is content displayed as a vertical feed, a map, a grid, a magazine
spread, a dashboard, a single-focus canvas? Each implies different user intent and
different information architecture.

**Density** — How much information is visible per screen without scrolling? High density
(data tables, dashboards) and low density (editorial, hero-first landing pages) imply
different audiences and use cases.

**Typography** — The typeface is not decoration; it carries personality, sets reading
rhythm, and signals register. A display serif (Fraunces, Playfair Display) says something
fundamentally different from a geometric sans (DM Sans, Plus Jakarta) or a monospace-
influenced hybrid. Load real fonts. Do not write "use a serif" in a comment and render
everything in system-sans.

**Colour philosophy** — A near-monochrome palette with one accent behaves differently
from a full-spectrum palette, which behaves differently from a duotone, which behaves
differently from a dark-mode-first palette with neon accents. Colour philosophy includes
the role of white space, the use of tint and shade, the relationship between background
and foreground density.

**Imagery treatment** — Full-bleed photography, cropped thumbnail grids, illustrated
icons, map tiles, data visualisations, schematic line art, and no images at all are each
a different answer to "what is the product's visual register?" The imagery treatment
determines what the product feels like at a glance.

**Interaction model and product metaphor** — What is the primary verb? Browse, search,
map, curate, compare, read? The metaphor — marketplace, magazine, atlas, dashboard, tool
— shapes every downstream decision about layout and interaction. Two products with the
same data but different metaphors look nothing alike.

## How to apply

When a request for N distinct design directions arrives, start by generating N design
hypotheses as prose — one sentence each — before touching any tooling. Each hypothesis
names the metaphor, the primary audience posture, and the signature typographic choice.
If the hypotheses are not clearly different from each other, the designs will not be
either.

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

Once the hypotheses are distinct, each prototype is built as a self-contained page with
its own `<head>` (own font imports), own global stylesheet (no shared reset or layout
shell), own component structure, and own imagery. No shared layout component receives
data-attribute theming.

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

Contrast this with the anti-pattern:

```html
<!-- WRONG — one shell, swapped via data-palette; this is not a separate direction -->
<body data-palette="editorial" data-shape="rounded" data-material="light">
  <market-shell>...</market-shell>
</body>
```

### Typography: load actual fonts

Do not use system fonts for design exploration unless the direction specifically calls
for them. Load real, distinctive fonts from Google Fonts, Bunny Fonts, or local files.
The rendering difference between Fraunces at `optical-sizing: auto` and a system sans-
serif is not subtle — it is the entire register of the design. A prototype without real
fonts is a wireframe, not a design direction.

For each prototype, make the font choice load-bearing and specific. If the direction is
"neo-brutalist market", the font is not "a bold sans" — it is Unbounded, or Space
Grotesk, or Monument Extended. Name the font, load the font, render with the font.

## Anti-patterns

**Token preset as direction**

Six `<body data-theme="X">` variants are one design. Rename "direction 1–6" to
"theme 1–6" and tell the user honestly that you have built a theme switcher, not a
design exploration. Do not present a theme preset as a design direction.

**Identical layout with different accent colours**

If every direction has the same card component, same grid columns, same navigation
structure, same header height, and same footer — varying only accent colour — they are
not distinct directions. Accent colour is the least informative design axis.

**"Font: sans-serif" in the CSS**

Using `font-family: sans-serif` in a prototype for a direction described as "modern,
clean, geometric" is not a design choice — it is a placeholder. It means the typography
axis was not varied, which means the direction is under-specified. Load the font.

**Density uniformity across directions**

All six directions having the same 16-item grid at 1200px wide is a sign that density
was not varied. A high-density direction should feel genuinely different from a low-
density direction when you glance at them both at actual viewport size.

## See also

[Minimalism: no emoji, schematic, duotone](/kb/design-ux/minimalism-no-emoji-schematic) —
the specific visual philosophy that applies once a direction is confirmed, including
the concrete lesson from removing stat chips and extra modules from the bento-marketplace
prototype after it felt like a spam site.

[The design phase is not the coding phase](/kb/design-ux/design-phase-is-not-code-phase) —
the upstream rule: when producing design directions, stay in design-tool space; do not
let the multi-direction brief trigger a multi-workspace scaffold.
