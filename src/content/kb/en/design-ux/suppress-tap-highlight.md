---
title: 'Kill the mobile tap-highlight flash'
category: design-ux
summary: 'Set -webkit-tap-highlight-color: transparent once, globally, so taps stop painting a blue/grey box; give touch its own :active feedback and keep :focus-visible for keyboards.'
principle: 'Suppress the WebKit tap-highlight globally and design your own press feedback; never let the browser paint a default flash, and never remove the keyboard focus ring while doing it.'
severity: strong
tags: [design-ux, mobile, css, accessibility, touch, polish]
sources:
  - project: 'this knowledge-base site'
    date: 2026-06-11
    note: 'The floating table-of-contents button flashed a blue box on tap on mobile; fixed with a global transparent tap-highlight plus an :active state.'
related:
  - design-ux/mobile-proof-real-devices
  - design-ux/minimalism-no-emoji-schematic
  - web-components/aria-on-the-real-element
order: 6
updated: 2026-06-11
---

Tap any link or button on a mobile WebKit browser and, by default, it paints a
translucent box over the element for as long as your finger is down. The colour comes
from the platform rather than from you, usually a blue or grey rectangle that ignores
your border radius and clips to the element box. Nothing else marks an interface as "a
web page" rather than "an app" so quickly, and it fires on every control you have: nav
links, cards, icon buttons, all of them.

The fix is one inherited declaration. The harder part is the two things you must
*not* do while applying it.

## Why this matters

On this site the floating "On this page" button (the control that opens the table of
contents on a phone) flashed a blue box on every tap. The button already had a hover
style, a focus ring, and an `:active` transform, and the flash sat on top of all of it
and undid the work. The element looked hand-built right up until you touched it, when
the platform stamped its default over the top.

`-webkit-tap-highlight-color` is the property that paints it. It is **inherited**, and
that is what lets you fix it cleanly. Set it once on the root and every descendant
inherits the value, including the contents of shadow-DOM custom elements, since
inherited properties cross the boundary. One line removes the flash everywhere instead
of you chasing it control by control.

## How to apply

Set it transparent at the root, in your global reset:

```css
html {
  -webkit-tap-highlight-color: transparent;
}
```

That is the whole fix for the flash. Now put back the feedback you just removed, because
a touch should still *feel* like it registered:

```css
.toggle:active {
  transform: scale(0.97);
}
.chip:active {
  border-color: var(--border-strong);
}
```

`:active` fires for the duration of a touch (and a mouse press), so it is the right
hook for press feedback. Keep it cheap, a transform or a colour shift, so it never
triggers layout.

Custom elements get the value by inheritance. If you want a component to stand on its
own and still be correct when dropped into a page that forgot the reset, restate it on
the host:

```css
:host {
  -webkit-tap-highlight-color: transparent;
}
```

## Anti-patterns

```css
/* Removing the focus ring along with the flash. This breaks keyboard and
   switch users — they lose all indication of where focus is. The flash is a
   touch artefact; :focus-visible is an accessibility requirement. Keep it. */
* {
  -webkit-tap-highlight-color: transparent;
  outline: none; /* never */
}
```

```css
/* Setting an opaque tap-highlight to "theme" it. You cannot match your radius
   or padding, it still clips to the box, and it is inconsistent across engines.
   Transparent + your own :active is the only reliable result. */
a {
  -webkit-tap-highlight-color: rgba(0, 0, 0, 0.1);
}
```

```css
/* Repeating the declaration on dozens of selectors because you forgot it
   inherits. One rule on html is enough; the rest is noise. */
a,
button,
.card,
.chip,
.icon-button {
  -webkit-tap-highlight-color: transparent;
}
```

## Enforcement

Put the declaration in the single global reset and then review for two regressions. A
`:focus-visible` outline must survive so keyboard focus stays visible, and every
interactive control must keep an `:active` (or equivalent) state so touch feedback is
not silently lost. A quick manual pass on a real device, tapping every control type,
catches both faster than any lint rule.

## See also

This is the touch-input companion to proving the UI on
[real mobile devices](/kb/design-ux/mobile-proof-real-devices): the flash only shows on
a phone, so it only gets caught when you actually test on one. The focus-ring caveat
ties back to putting interaction, along with its visible state, on
[the real interactive element](/kb/web-components/aria-on-the-real-element).
