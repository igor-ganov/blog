---
title: 'Minimalism: no emoji, schematic, duotone'
category: design-ux
summary: 'Prefer schematic SVG/CSS over decoration, no emoji or clipart, duotone palette plus grays, and reduce density rather than adding modules when something feels cluttered.'
principle: 'Prefer minimalism and schematic SVG/CSS over decoration; no emoji, no clipart; few words; duotone plus grays; reduce density rather than adding modules.'
severity: strong
tags: [design-ux, minimalism, svg, css, typography, color, density]
sources:
  - project: 'a multi-product company (DDD case study)'
    date: 2026-05-27
    note: 'minimalism, no emoji, schematic SVG/CSS, duotone + grays, system sans-serif; presentations: duotone blue/yellow + grays, few words per slide, no clipart'
  - project: 'a real-estate listings site'
    date: 2026-05-12
    note: 'low-density over spammy; removed emoji chips and extra modules; one accent; bento marketplace direction rebuilt after feeling like a 2000s spam site'
related:
  - design-ux/distinct-designs-vary-many-axes
  - angular/no-material-native-web-platform
order: 3
updated: 2026-05-27
---

Every decorative element is a claim on the user's attention. An emoji next to a label, a
clipart illustration in a slide, a stat chip with a coloured background, a price tag with
a rotation transform: each says "look at me" while competing with the content that
actually carries meaning. Pile up enough of them and the page reads as busy, amateur, or
like a 2000s spam site. That last description is what triggered a full redesign of the
bento marketplace direction prototype in May 2026.

The rule is not "be boring". It is to let structure and typography carry the design
instead of decoration. Schematic SVG lines and geometric shapes communicate information;
emoji and clipart communicate noise.

## Why this matters

### The bento marketplace incident

The original bento marketplace direction prototype tried to convey liveliness through
density and decoration: emoji stat chips (star ratings, like counts), rotated paper
price-tag SVGs on each listing card, extra promotional modules above the fold, and
per-tile pastel background cycling that made the grid look like a patchwork quilt.

The feedback was that it felt like a spam site from 2000. That signal is worth taking
seriously, because decoration at that density pattern-matches to low-quality commercial
content that users have trained themselves to distrust. The redesign kept exactly one
accented module, a single featured listing with high visual weight, and stripped
everything else back to typography, a hard border grid, and a two-colour palette. The
page came out quieter and more trustworthy.

### The multi-product company presentation standard

The brand and presentation guidelines established for a multi-product company (DDD case
study) (2026-05-27) codify this explicitly: no emoji, no clipart, no decorative
illustrations. Diagrams are schematic, with line-weight rather than colour fill marking
hierarchy. Slides carry few words instead of full sentences. The presentation palette is
duotone: one blue plus one yellow, with grays for supporting text and UI chrome. Anything
outside that set draws the eye without justification.

This blog runs on the same principles: ink-blue plus amber, no emoji anywhere in the
design system, schematic icons only, white space as the primary structural element.

### Why duotone

A two-hue palette forces clarity. With one accent and one primary, every colour decision
becomes structural: is this accent-worthy or not? Accent-worthy means it communicates a
state, a call to action, or a primary hierarchy distinction, never that it is merely
decorative. Add a third hue, then a fourth, and each addition has to answer "why?". The
answer usually turns out to be that the previous two were not used cleanly enough yet.

Duotone plus grays also compresses well. A UI that renders cleanly in two colours is
almost always readable in a single colour (print, accessibility, low-quality screens). A
UI that needs five colours to read correctly has a structural problem that the fifth
colour is papering over.

## How to apply

### Palette construction

Start with one primary and one accent, then add grays. Define at minimum:

```css
:root {
  /* Primary — used for headings, body text, primary actions */
  --color-ink:     #1a2236;  /* near-black with a hint of the primary hue */

  /* Accent — used sparingly: one call to action, one highlight, one link state */
  --color-accent:  #f59e0b;  /* amber; warm contrast against ink-blue */

  /* Grays — used for supporting text, borders, backgrounds, UI chrome */
  --color-gray-50: #f9fafb;
  --color-gray-100:#f3f4f6;
  --color-gray-300:#d1d5db;
  --color-gray-500:#6b7280;
  --color-gray-700:#374151;

  /* Semantic — derived, never additional hues */
  --color-surface: var(--color-gray-50);
  --color-border:  var(--color-gray-300);
  --color-text:    var(--color-ink);
  --color-text-muted: var(--color-gray-500);
}
```

There is no third hue in this set. If a new component needs a colour, the question is
which of the existing roles it maps to, not which new colour to add.

### Icons and illustrations: SVG, schematic, stroke-based

Use SVG icons built from geometric primitives with a consistent stroke weight. Do not
use emoji as icons. Do not source illustrations from clipart libraries.

```html
<!-- Bad: emoji as icon — decorative, culturally loaded, varies by OS -->
<span>🏠 Properties</span>

<!-- Good: schematic SVG — geometric, scalable, controlled -->
<svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none"
     stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <path d="M2 7.5L8 2l6 5.5V14a.5.5 0 0 1-.5.5h-3.75V10h-3.5v4.5H2.5A.5.5 0 0 1 2 14V7.5Z"/>
</svg>
<span>Properties</span>
```

For diagrams and architecture drawings, use SVG paths and groups. No raster images, no
screenshots-as-diagrams, no hand-drawn illustration overlays. Keep stroke weights to one
or two values at most, and use opacity or gray scale to separate secondary elements from
primary ones.

### Presentations: few words, no clipart

A slide that carries a full paragraph of text has failed, because the text competes with
what the speaker is saying. A slide should carry a headline (one claim, under 10 words)
and supporting evidence in the fewest words possible, with diagrams standing in for prose
wherever they can.

For presentations, this standard is:
- Font: system sans-serif or one geometric sans (Inter, DM Sans); no display serifs in
  slide decks.
- Palette: one blue + one yellow (amber/gold) + grays. No additional colours.
- Diagrams: SVG/CSS line diagrams in ink on white. No 3D effects, no gradients, no
  drop shadows except functional (card separation).
- Visuals: screenshots of actual work or schematic SVG. No stock photography, no clipart.

### Reducing density, not adding modules

When a design feels empty or underperforms commercially, the instinct is to add content:
another promotional module, more stat chips, a second call-to-action strip. That instinct
is almost always wrong. Emptiness usually means the typography or spacing is not carrying
the weight it should. Fix the typography first (increase the heading size, tighten the
leading, use a more distinctive weight contrast) before you reach for more content.

```css
/* Before: adding a module to fill space */
/* Result: busier, not better */

/* After: adjusting typographic hierarchy to fill the space */
.listing-headline {
  font-size: clamp(1.5rem, 4vw, 2.5rem); /* was: 1.25rem fixed */
  font-weight: 700;                        /* was: 500 */
  line-height: 1.1;                        /* was: 1.4 */
  letter-spacing: -0.02em;                 /* tightened for large display */
}
```

If the page still needs more visual weight after the typography is fixed, add white space
around a single strong element rather than adding a new element. One large, well-spaced
image with strong typography beats three medium images with captions.

## Anti-patterns

**Emoji as communication**

Any emoji used as a bullet, icon substitute, status indicator, or emphasis marker in a UI
is a category error. Emoji are person-to-person communication glyphs designed for plain
text; they have no defined size, rendering, or semantic value in a UI context. Replace
every emoji with either a stroke SVG icon or plain text.

```html
<!-- Anti-pattern -->
<p>✅ Verified listing</p>
<p>⭐ 4.8 rating</p>
<p>🔥 Popular</p>

<!-- Correct -->
<p><svg aria-hidden="true"><!-- checkmark --></svg> Verified listing</p>
<p><span class="rating">4.8</span> <span class="rating-label">/ 5</span></p>
<p class="badge badge--popular">Popular</p>
```

**Clipart and stock illustration**

A stock illustration of "a person using a laptop" or "a handshake" says nothing specific
about the product and dates immediately. Replace it with a screenshot of the actual
product, a schematic SVG diagram, or white space.

**Pastel cycling / per-item colour variation**

Assigning a different pastel background to each grid tile creates visual noise without
conveying information. Background colour variation is meaningful only when it encodes a
category or a state. Random or cycling variation should be removed.

**Decoration at high density**

Many small decorative elements (rotated price tags, emoji chips, ribbon badges, tilt
transforms) accumulate into a wall of visual noise. Once decorative elements occupy more
than 20% of the screen area at any breakpoint, the density has crossed into spam
territory. Remove decorations before you remove content.

## See also

[Distinct designs vary many axes](/kb/design-ux/distinct-designs-vary-many-axes) is the
upstream design-direction rule. Minimalism principles apply after a direction is chosen,
not instead of choosing one.

[No Material by default; build on the Web Platform](/kb/angular/no-material-native-web-platform)
is the implementation counterpart: lean, token-driven components that express the same
minimalist philosophy through CSS rather than through a design system override stack.
