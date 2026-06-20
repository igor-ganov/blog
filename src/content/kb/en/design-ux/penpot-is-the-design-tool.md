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

Penpot (penpot.app) is an open-source design tool, the self-hosted alternative to
Figma. The team runs a local, self-hosted Penpot instance, and that is where design
work happens: components get created, prototypes get wired, design tokens get
maintained. Work flows into Penpot rather than around it.

On a design-stage project (2026-04-26) the tool was referred to as "пинпод" and
"penpod". Both are Penpot, transliterated through Russian phonology. The name went
unrecognised, so the response proposed an Angular workspace and Storybook. That missed
on two counts. The tool was misidentified, and the phase was wrong too (see [The design
phase is not the coding phase](/kb/design-ux/design-phase-is-not-code-phase)). The right
move was to ask for the local Penpot URL and carry on inside the design tool.

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

Knowing these capabilities tells you which deliverables fit. A request to "add a colour
token" has a Penpot-native answer (add it to the token set in the assets panel, or
export a modified token JSON), not an Angular one.

### Spelling variants

The team's transliteration of "Penpot" varies. All of the following mean Penpot:

- пинпод / penpod / pinpot / пенпот / penpot

When any of these show up, don't treat them as unknown tooling. Read them as Penpot and
proceed. If the local URL isn't already known, ask for it.

## How to apply

There are four ways to work with a local Penpot instance.

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

To manipulate the Penpot canvas directly (creating frames, placing components,
adjusting layout), drive the running Penpot instance via the browser MCP, either
Playwright or Chrome DevTools Protocol. Steps:

1. Ask for the local Penpot URL (typically `http://localhost:7070` or the configured
   port) and credentials if not already provided.
2. Use the browser MCP to navigate to the file and open the design canvas.
3. Interact via the Penpot web UI: select tools from the toolbar, create shapes, set
   fill values in the design panel, wire prototype connections.

Penpot's web UI is the canonical interface, and driving it via MCP is the same as a
human operating it. Don't modify `.penpot` ZIP files in place while Penpot has the file
open; Penpot will overwrite your changes on the next save.

### 4. Generate .penpot import files

For larger deliverables such as a complete component library or a page set, you can
generate a `.penpot` file from scratch. The format is a ZIP archive:

```
file.penpot
├── manifest.json   # file metadata, page list, component registry
├── data/
│   └── <file-uuid>.edn  # EDN-serialised design tree
└── media/
    └── <uuid>.<ext>     # embedded raster assets
```

The EDN structure is hard to write by hand, so this approach only pays off when you
start from an existing `.penpot` template or can script the structure. For most tasks,
W3C token JSON plus SVG assets covers what you need to deliver without knowing the file
format at all.

### Asking for the URL and credentials

If the local Penpot URL is not in the project context and the task requires interacting
with the running instance, ask exactly:

> "What is the local URL for your Penpot instance, and do you have credentials for me
> to use?"

Don't assume `localhost:7070` without confirmation. The port is configurable, and the
instance may sit behind a reverse proxy.

## Anti-patterns

**Not recognising the tool**

Seeing "пинпод" or "penpod", treating it as an unfamiliar tool, and then proposing a
different toolchain is the exact error described above. Identify the tool, then work
with it.

**Proposing to install a different design tool**

If the user works in Penpot, don't suggest Figma, Sketch, or Adobe XD as alternatives.
The tool has already been chosen, so the task is to work inside it.

**Generating Storybook stories or component scaffolds for design tasks**

A request to "create the card component in Penpot" is a design task. The correct
deliverable is a Penpot-native component spec (variant axes, auto-layout settings, token
references). A `.stories.ts` file is not a design deliverable.

**Exporting CSS as the design deliverable**

CSS is an implementation artefact, not a design artefact. Handing a block of CSS custom
properties to a Penpot design task collapses the design phase into the implementation
phase. The design deliverable is a token JSON, and the CSS that consumes it comes later,
as a separate document for a separate phase.

## See also

[The design phase is not the coding phase](/kb/design-ux/design-phase-is-not-code-phase) —
the rule that triggered this guidance: when a task is in Penpot, the response scope is
design concepts and design-tool operations; code enters the conversation only when
explicitly requested.

[Drive the real browser over MCP](/kb/tooling-runtime/drive-the-real-browser-over-mcp) —
the tooling principle behind driving Penpot via the browser MCP: interact with the
running application rather than replacing it with a simulated environment.
