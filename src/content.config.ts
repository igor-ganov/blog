import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// How strongly a practice is held. Drives the badge on each article.
const severity = z.enum(['non-negotiable', 'strong', 'preferred', 'context']);

// YAML parses an unquoted `2026-05-09` into a Date, while a quoted one stays a
// string. Accept either and normalise to a YYYY-MM-DD string for formatting.
const isoDate = z
  .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'), z.date()])
  .transform((value) => (value instanceof Date ? value.toISOString().slice(0, 10) : value));

// Provenance: which real project decision this practice was distilled from,
// and when. Newer sources override older ones when they conflict.
const source = z.object({
  project: z.string(),
  note: z.string().optional(),
  date: isoDate,
});

const kb = defineCollection({
  loader: glob({ pattern: ['**/*.md', '!**/README.md'], base: './src/content/kb' }),
  schema: z.object({
    title: z.string(),
    category: z.enum([
      'typescript',
      'functional-architecture',
      'angular',
      'web-components',
      'testing',
      'error-handling',
      'ddd',
      'backend-events',
      'build-ci-deploy',
      'tooling-runtime',
      'process',
      'design-ux',
      'platform',
    ]),
    summary: z.string(),
    principle: z.string(),
    severity,
    tags: z.array(z.string()).default([]),
    sources: z.array(source).default([]),
    related: z.array(z.string()).default([]),
    order: z.number().default(100),
    updated: isoDate.optional(),
    draft: z.boolean().default(false),
  }),
});

// Essays that aggregate and explain the principles — narrative, not reference.
// Separate from `kb`: no severity or provenance, just a date and ordering.
const blog = defineCollection({
  loader: glob({ pattern: ['**/*.md', '!**/README.md'], base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: isoDate,
    tags: z.array(z.string()).default([]),
    order: z.number().default(100),
    draft: z.boolean().default(false),
  }),
});

// Page copy: one Markdown file per page per locale, mirroring the route tree.
// Each page carries a flat map of strings in frontmatter (title/description plus
// the page's own labels and prose), so the source of truth is a file under
// `src/content` — discoverable and covered by the prose linter.
const pages = defineCollection({
  loader: glob({ pattern: ['**/*.md', '!**/README.md'], base: './src/content/pages' }),
  schema: z.object({ title: z.string().optional(), description: z.string() }).catchall(z.string()),
});

// Apps & demos: one Markdown file per project per locale. `kind` distinguishes a
// repo/app card from a CodePen embed; `codepen` holds the pen id when kind=pen.
const apps = defineCollection({
  loader: glob({ pattern: ['**/*.md', '!**/README.md'], base: './src/content/apps' }),
  schema: z.object({
    title: z.string(),
    blurb: z.string(),
    kind: z.enum(['app', 'pen']).default('app'),
    repo: z.string().optional(),
    demo: z.string().optional(),
    codepen: z.string().optional(),
    stack: z.array(z.string()).default([]),
    date: isoDate,
    order: z.number().default(100),
    draft: z.boolean().default(false),
  }),
});

export const collections = { kb, blog, pages, apps };
