---
title: 'Mobile is proved on real devices, not emulation'
category: design-ux
summary: 'Mobile layout changes are not accepted without screenshots of every affected page at a real mobile viewport; some CSS properties behave differently on real devices and are invisible in DevTools emulation.'
principle: 'Prove mobile layout with screenshots of every affected page at a real mobile viewport; beware properties invisible in DevTools emulation but visible on real devices, like scrollbar-gutter.'
severity: strong
tags: [design-ux, mobile, css, testing, screenshots, scrollbar-gutter]
sources:
  - project: 'a deploy-monitoring tool'
    date: 2026-04-19
    note: 'scrollbar-gutter:stable strip on overlay-scrollbar mobile; wrap in min-width:768px; invisible in emulation'
  - project: 'a content-admin SPA'
    date: 2026-04-19
    note: 'mobile proof = screenshots of every page at mobile viewport; accepted only as a complete folder'
related:
  - process/prove-with-production-screenshots
  - tooling-runtime/drive-the-real-browser-over-mcp
order: 4
updated: 2026-04-19
---

Chrome DevTools device emulation is a viewport simulator, not a device simulator. It
sets `window.innerWidth`, scales the viewport, and simulates touch events. It does not
replicate the operating system's scrollbar model, input method behaviour, font rendering
stack, or browser chrome geometry. A layout that looks correct in DevTools emulation
can still have a visible defect on a real device — and that defect only surfaces when a
human holds the phone.

On one project (2026-04-19) this was not theoretical. A `scrollbar-gutter:
stable` declaration on the `html` element, added to prevent layout shift when a modal
opens on desktop, created a visible white strip on the right edge of every page on
mobile. Desktop browsers with overlay scrollbars (macOS, iOS, Android) reserve no space
for the scrollbar gutter, but `scrollbar-gutter: stable` forces a reservation anyway —
resulting in a permanent 15px-wide white strip down the right side of the screen. In
DevTools mobile emulation the strip was invisible because DevTools did not simulate the
overlay-scrollbar model accurately. It was only visible on real hardware.

Mobile layout work from that point was accepted only as a complete folder of screenshots
of every page at mobile viewport dimensions. Not a single representative page. Every
page.

## Why this matters

### The DevTools emulation gap

DevTools mobile emulation correctly simulates:
- Viewport width and height at the given device preset
- `device-pixel-ratio` for pixel-density dependent CSS
- Touch event dispatch
- UA string (via the network conditions panel)

DevTools mobile emulation does NOT accurately simulate:
- **Scrollbar model** — desktop Chrome renders DevTools emulation with the same
  scrollbar model as the desktop OS. Overlay scrollbars (iOS, Android, macOS with
  "show scrollbars: when scrolling") do not reserve layout space, but `scrollbar-gutter`
  assumes they do.
- **Browser chrome geometry** — the address bar on mobile shrinks on scroll, changing
  `100vh` to a larger value than expected. `dvh` (dynamic viewport height) does not
  have this problem; `vh` does. DevTools does not simulate address-bar collapse.
- **System font rendering** — iOS renders `-apple-system` fonts with subpixel rounding
  that differs from Chrome on Android. Type that fits a container at 375px in DevTools
  may wrap differently on a real iOS device.
- **Input method overlay** — the software keyboard on mobile reduces the visual viewport.
  `100vh` positioned elements that sit above the fold can overlap the keyboard in ways
  that DevTools "show keyboard" does not replicate.

### The `scrollbar-gutter` incident

`scrollbar-gutter: stable` prevents layout shift when content tall enough to trigger
a scrollbar is added to the page — the gutter is reserved in advance, so adding the
scrollbar does not shift content left. This is a valid desktop behaviour.

On mobile, scrollbars are overlay overlays. They appear transiently over content and
reserve no space. `scrollbar-gutter: stable` on `html` on a mobile browser with
overlay scrollbars creates a reserved-but-invisible gutter — visible as a white strip
matching the scrollbar-gutter width on the right edge of every page.

The fix: scope it to the breakpoint where desktop scrollbars exist.

```css
/* Bad: applies scrollbar-gutter reservation to all viewports including mobile */
html {
  scrollbar-gutter: stable;
}

/* Good: reserve gutter only where scrollbars take up layout space */
@media (min-width: 768px) {
  html {
    scrollbar-gutter: stable;
  }
}
```

When debugging mobile overflow or unexpected right-side whitespace, check this property
first. It is the most common source of invisible-in-emulation, visible-on-device right
edge issues.

### The `100vh` / address bar problem

Mobile browsers have a dynamic viewport where the address bar hides on scroll. This
makes the visual viewport taller than `100vh` once the user starts scrolling. An element
set to `height: 100vh` is shorter than the actual available space when the address bar
is hidden, causing gaps below hero sections, footers that do not reach the bottom, and
clipped full-page overlays.

```css
/* Bad: 100vh is "initial viewport height" — shorter than full-screen on mobile after
   address bar hides */
.hero {
  height: 100vh;
}

/* Good: dvh tracks the dynamic viewport height — correct on mobile and desktop */
.hero {
  height: 100dvh;
}

/* Fallback for browsers that do not support dvh (Safari < 15.4) */
.hero {
  height: 100vh;       /* fallback */
  height: 100dvh;      /* progressive enhancement */
}
```

## How to apply

### The proof requirement

Mobile layout work is complete only when a screenshot folder exists containing every
page that was changed, captured at a real mobile viewport. The folder structure is:

```
screenshots/mobile-proof/
  home.png
  listing-detail.png
  search-results.png
  user-profile.png
  settings.png
  ... (one screenshot per route that exists in the app)
```

"Every page" means every distinct route, not just the ones the PR touched directly.
A layout change (grid change, spacing change, header change, CSS custom property change)
can cascade to pages the author did not consciously modify. The screenshot of every page
is the only way to catch cascading regressions.

If screenshots cannot be taken on real hardware, use the mobile browser directly — open
the page on a physical phone and screenshot there, or use a real-device cloud service.
Do not use the DevTools device toolbar as a substitute.

### The mobile debugging checklist

When a mobile layout issue is reported or suspected, check in this order:

1. `scrollbar-gutter` on `html` or `body` — is it unguarded by a breakpoint?
2. `height: 100vh` on full-screen elements — should it be `100dvh`?
3. Fixed-position elements — are they accounting for the dynamic viewport?
4. `overflow-x: hidden` on `body` — is it hiding a real horizontal overflow rather than
   fixing it? (Hidden overflow masks layout bugs instead of resolving them.)
5. Viewport meta tag — is `width=device-width, initial-scale=1` present? Without it,
   mobile browsers use a scaled 980px layout viewport.

```html
<!-- Required — without this, the entire responsive layout breaks on mobile -->
<meta name="viewport" content="width=device-width, initial-scale=1">
```

### CSS properties with emulation/device gaps

| Property | Emulation behaviour | Real device behaviour |
|---|---|---|
| `scrollbar-gutter: stable` | No visible strip (emulation has no overlay model) | White strip on overlay-scrollbar devices |
| `height: 100vh` | Matches emulated viewport exactly | Shorter than visual viewport once address bar hides |
| `position: fixed` + `bottom: 0` | Sits at emulated viewport bottom | Sits above keyboard when keyboard is open |
| `touch-action: manipulation` | No effect visible in emulation | Removes 300ms tap delay on some Android browsers |
| `-webkit-overflow-scrolling: touch` | Ignored in emulation | Enables momentum scroll on iOS (deprecated but still present) |

## Anti-patterns

**"I checked in DevTools, it looks fine"**

DevTools is not evidence for mobile. It is evidence for desktop-at-narrow-width. For
mobile-specific properties and behaviours, real hardware or a real device cloud is
required. Attaching a DevTools screenshot as mobile proof is not accepted.

**Fixing one page, not checking all pages**

A CSS change that targets a layout primitive (`.container`, `.page`, `body`, `html`,
`:root`) affects every page. Checking only the page being actively worked on misses
cascading regressions. The screenshot folder covers all routes.

**Fixing mobile overflow with `overflow-x: hidden` on body**

This hides the overflow rather than resolving it. The layout defect is still there;
it is just invisible. On some mobile browsers, hiding overflow on `body` also disables
scroll-momentum and breaks fixed-position elements. The correct fix is to find the
element causing overflow and fix its width or transform.

```css
/* Anti-pattern: masks the problem */
body {
  overflow-x: hidden;
}

/* Diagnosis tool: use this temporarily to find the offending element, then remove */
* {
  outline: 1px solid red;
}
/* Then fix the actual element — do not ship the hidden overflow */
```

## See also

[Prove with production screenshots](/kb/process/prove-with-production-screenshots) —
the broader process rule that mobile screenshots are an instance of: claims about
production behaviour require production evidence.

[Drive the real browser over MCP](/kb/tooling-runtime/drive-the-real-browser-over-mcp) —
the tooling counterpart: when scripting browser tests, drive a real browser instance
rather than a simulated one, for the same reasons that apply to mobile proofing.
