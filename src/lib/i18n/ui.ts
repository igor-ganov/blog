import { parse } from 'yaml';
import { z } from 'zod';
import enRaw from '@/content/i18n/en.yml?raw';
import itRaw from '@/content/i18n/it.yml?raw';
import ruRaw from '@/content/i18n/ru.yml?raw';
import { defaultLocale, type Locale } from '@/lib/i18n/locales';

// User-facing chrome strings live in `src/content/i18n/<locale>.yml`; page copy
// lives in the `pages` content collection. This schema validates each locale at
// build time, so a missing or misspelled key is a build error rather than a
// runtime surprise — the guarantee the old typed object gave, kept in data form.
const chromeSchema = z.object({
  skipToContent: z.string(),
  brand: z.string(),
  titleSuffix: z.string(),
  language: z.string(),
  nav: z.object({
    primary: z.string(),
    menu: z.string(),
    blog: z.string(),
    principles: z.string(),
    skills: z.string(),
    apps: z.string(),
    about: z.string(),
  }),
  footer: z.object({ lede: z.string(), meta: z.string() }),
  breadcrumb: z.object({ label: z.string(), principles: z.string(), blog: z.string() }),
  pager: z.object({ previous: z.string(), next: z.string(), withinCategory: z.string() }),
  aside: z.object({ provenance: z.string(), tags: z.string(), related: z.string() }),
  article: z.object({ principleLabel: z.string() }),
  severity: z.object({
    'non-negotiable': z.string(),
    strong: z.string(),
    preferred: z.string(),
    context: z.string(),
  }),
  filter: z.object({
    placeholder: z.string(),
    label: z.string(),
    empty: z.string(),
    byTag: z.string(),
  }),
  toc: z.object({ onThisPage: z.string(), close: z.string() }),
  theme: z.object({ toggle: z.string(), light: z.string(), dark: z.string(), system: z.string() }),
  card: z.object({ onePractice: z.string(), manyPractices: z.string() }),
  categoryEmpty: z.string(),
});

export type UIStrings = z.infer<typeof chromeSchema>;

const load = (raw: string): UIStrings => chromeSchema.parse(parse(raw));

const en = load(enRaw);
const overrides: Readonly<Partial<Record<Locale, UIStrings>>> = {
  en,
  it: load(itRaw),
  ru: load(ruRaw),
};

// Return the locale's strings, falling back to the default so the site renders in
// every language even if a translation is incomplete.
export const t = (locale: Locale): UIStrings => overrides[locale] ?? overrides[defaultLocale] ?? en;
