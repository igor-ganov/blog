---
title: 'Penpot is the design tool — drive it, don''t replace it'
category: design-ux
summary: 'The team designs in a local self-hosted Penpot; work with it by generating W3C design tokens, SVG assets, or .penpot files, or by driving it directly via the browser MCP — and recognise that "пинпод/penpod" means Penpot.'
principle: 'The team designs in a local self-hosted Penpot; work with it (W3C design tokens, SVG assets, .penpot files, or driving it via the browser MCP), and recognise "пинпод/penpod" means Penpot.'
severity: context
tags: [design-ux, penpot, design-tokens, browser-mcp, tooling]
sources:
  - project: 'a design-stage project'
    date: 2026-04-26
    note: 'local self-hosted Penpot; "пинпод"=Penpot; W3C tokens/SVG/.penpot or drive via MCP; Angular/Storybook proposed instead'
related:
  - design-ux/design-phase-is-not-code-phase
  - tooling-runtime/drive-the-real-browser-over-mcp
order: 5
updated: 2026-04-26
---

Penpot (penpot.app) is an open-source design tool — the self-hosted alternative to
Figma. The team's design tool is a local, self-hosted Penpot instance. When design work
arrives, Penpot is the production design environment: the place where components are
created, prototypes are wired, and design tokens are maintained. Work flows into Penpot,
not around it.

On a design-stage project (2026-04-26) the tool was referred to as "пинпод" and
"penpod" — treat these as Penpot (transliterations through Russian phonology). The tool
was not recognised, so the response proposed an Angular workspace and Storybook. That
was wrong on two counts: wrong tool identification, and wrong phase (see [The design
phase is not the coding phase](/kb/design-ux/design-phase-is-not-code-phase)). The
correct response was to ask for the local Penpot URL and proceed in the design tool.

## Why this matters

### Penpot's design capabilities

Penpot supports:
- **Components** — main components with variants, controlled via boolean props, text
  override props, and nested component swapping. This maps closely to Figma's component
  system.
- **Design tokens** — W3C Design Tokens Community Group format (DTCG) token files; can
  be imported and exported as JSON.
- **Prototyping** — frame-to-frame connections with transition types (instant, dissolve,
  slide), delay, scroll overlays, fixed positioning.
- **Auto-layout** — flex-based layout in frames, analogous to Figma's auto-layout.
- **Assets** — SVG export from any shape; shared libraries across pages and files.
- **File format** — `.penpot` files are ZIP archives containing EDN data + assets;
  importable via the Penpot import dialog.

Understanding these capabilities determines what deliverables are appropriate. A request
to "add a colour token" has a correct Penpot-native answer (add it to the token set in
the assets panel or export a modified token JSON), not an Angular answer.

### Spelling variants

The team's transliteration of "Penpot" varies. All of the following mean Penpot:

- пинпод / penpod / pinpot / пенпот / penpot

When any of these appear in context, do not treat them as unknown tooling. Identify
as Penpot and proceed accordingly. If the local URL is not already known, ask for it.

## How to apply

There are four modes of working with a local Penpot instance:

### 1. Generate W3C design token JSON

For token-level work (colour palettes, type scales, spacing scales, shadow sets),
deliver a W3C DTCG-format JSON file. Penpot's token panel can import this directly.

```jsonc
// tokens.json — W3C DTCG format, importable into Penpot
{
  "color": {
    "brand": {
      "ink":    { "$value": "#1a2236", "$type": "color" },
      "accent": { "$value": "#f59e0b", "$type": "color" },
      "surface":{ "$value": "#f9fafb", "$type": "color" }
    },
    "neutral": {
      "100": { "$value": "#f3f4f6", "$type": "color" },
      "300": { "$value": "#d1d5db", "$type": "color" },
      "500": { "$value": "#6b7280", "$type": "color" },
      "700": { "$value": "#374151", "$type": "color" }
    }
  },
  "spacing": {
    "xs":  { "$value": "4px",  "$type": "dimension" },
    "sm":  { "$value": "8px",  "$type": "dimension" },
    "md":  { "$value": "16px", "$type": "dimension" },
    "lg":  { "$value": "24px", "$type": "dimension" },
    "xl":  { "$value": "32px", "$type": "dimension" },
    "2xl": { "$value": "48px", "$type": "dimension" },
    "3xl": { "$value": "64px", "$type": "dimension" }
  }
}
```

To import: Penpot assets panel → Tokens → Import token set → select the JSON file.

### 2. Generate SVG assets

For icons, illustrations, or schematic diagrams, deliver clean SVG files. Penpot
imports SVGs as vector objects, preserving paths, groups, and fill/stroke. Design-tool
SVGs should:
- Use `currentColor` for fills that should inherit component colour.
- Avoid embedded raster images (use pure paths).
- Keep the viewBox clean (no implicit transforms from an exporting tool's artboard).
- Use a consistent stroke width (e.g., `stroke-width="1.5"`) across an icon set.

```svg
<!-- icon-home.svg — clean, importable into Penpot as a vector component -->
<svg xmlns="http://www.w3.org/2000/svg"
     width="24" height="24" viewBox="0 0 24 24"
     fill="none" stroke="currentColor"
     stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <path d="M3 10.5L12 3l9 7.5V21a.75.75 0 0 1-.75.75H15V15H9v6.75H3.75A.75.75 0 0 1 3 21V10.5Z"/>
</svg>
```

### 3. Drive Penpot via the browser MCP

For direct manipulation of the Penpot canvas — creating frames, placing components,
adjusting layout — drive the running Penpot instance via the browser MCP (Playwright
or Chrome DevTools Protocol). Steps:

1. Ask for the local Penpot URL (typically `http://localhost:7070` or the configured
   port) and credentials if not already provided.
2. Use the browser MCP to navigate to the file and open the design canvas.
3. Interact via the Penpot web UI: select tools from the toolbar, create shapes, set
   fill values in the design panel, wire prototype connections.

Penpot's web UI is the canonical interface; driving it via MCP is equivalent to a human
operating it. Do not attempt to modify `.penpot` ZIP files in place while Penpot has
the file open — Penpot will overwrite changes on next save.

### 4. Generate .penpot import files

For larger deliverables (a complete component library, a page set), it is possible to
generate a `.penpot` file from scratch. The format is a ZIP archive with:

```
file.penpot
├── manifest.json   # file metadata, page list, component registry
├── data/
│   └── <file-uuid>.edn  # EDN-serialised design tree
└── media/
    └── <uuid>.<ext>     # embedded raster assets
```

The EDN structure is non-trivial to generate by hand; this approach is practical only
when working from an existing `.penpot` template or when the structure can be scripted.
For most tasks, W3C token JSON plus SVG assets covers the deliverable surface without
requiring file-format knowledge.

### Asking for the URL and credentials

If the local Penpot URL is not in the project context and the task requires interacting
with the running instance, ask exactly:

> "What is the local URL for your Penpot instance, and do you have credentials for me
> to use?"

Do not assume `localhost:7070` without confirmation — the port is configurable and the
instance may be behind a reverse proxy.

## Anti-patterns

**Not recognising the tool**

Seeing "пинпод" or "penpod" and treating it as an unfamiliar tool, then proposing a
different toolchain, is the exact error described above. Identify the tool, then work
with it.

**Proposing to install a different design tool**

If the user works in Penpot, do not suggest Figma, Sketch, or Adobe XD as alternatives.
The tool is chosen; the task is to work within it.

**Generating Storybook stories or component scaffolds for design tasks**

A request to "create the card component in Penpot" is a design task. The correct
deliverable is a Penpot-native component spec (variant axes, auto-layout settings, token
references). A `.stories.ts` file is not a design deliverable.

**Exporting CSS as the design deliverable**

CSS is an implementation artefact, not a design artefact. Delivering a block of CSS
custom properties to a Penpot design task conflates the design phase with the
implementation phase. The design deliverable is a token JSON; the implementation
deliverable is the CSS that consumes it. They are different documents for different
phases.

## See also

[The design phase is not the coding phase](/kb/design-ux/design-phase-is-not-code-phase) —
the rule that triggered this guidance: when a task is in Penpot, the response scope is
design concepts and design-tool operations; code enters the conversation only when
explicitly requested.

[Drive the real browser over MCP](/kb/tooling-runtime/drive-the-real-browser-over-mcp) —
the tooling principle behind driving Penpot via the browser MCP: interact with the
running application rather than replacing it with a simulated environment.
