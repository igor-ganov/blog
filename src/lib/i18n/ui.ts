import { defaultLocale, type Locale } from '@/lib/i18n/locales';

// All user-facing chrome strings, keyed by purpose. English is the complete
// reference; other locales provide a full object in `overrides` (filled during
// translation). `t(locale)` returns the locale's strings or falls back to English,
// so the site renders in every language even before a translation lands.
export interface UIStrings {
  readonly skipToContent: string;
  readonly brand: string;
  readonly titleSuffix: string;
  readonly language: string;
  readonly nav: {
    readonly blog: string;
    readonly principles: string;
    readonly skills: string;
    readonly about: string;
  };
  readonly footer: {
    readonly lede: string;
    readonly meta: string; // contains {year} and {name} placeholders
  };
  readonly breadcrumb: {
    readonly principles: string;
    readonly blog: string;
  };
  readonly pager: {
    readonly previous: string;
    readonly next: string;
  };
  readonly aside: {
    readonly provenance: string;
    readonly tags: string;
    readonly related: string;
  };
  readonly article: {
    readonly principleLabel: string;
  };
  readonly severity: {
    readonly 'non-negotiable': string;
    readonly strong: string;
    readonly preferred: string;
    readonly context: string;
  };
  readonly filter: {
    readonly placeholder: string;
    readonly label: string;
    readonly empty: string;
    readonly byTag: string;
  };
  readonly toc: {
    readonly onThisPage: string;
    readonly close: string;
  };
  readonly theme: {
    readonly toggle: string;
  };
  readonly card: {
    readonly onePractice: string;
    readonly manyPractices: string; // contains {count}
  };
}

const en: UIStrings = {
  skipToContent: 'Skip to content',
  brand: 'Engineering Practices',
  titleSuffix: 'Engineering Practices',
  language: 'Language',
  nav: { blog: 'Blog', principles: 'Principles', skills: 'Skills', about: 'About' },
  footer: {
    lede: 'A living knowledge base — engineering practices distilled from real project decisions. Newer decisions override older ones; every claim carries its provenance.',
    meta: 'Built with Astro 5, Lit, strict TypeScript and Biome — the same stack and rules it documents. © {year} Igor Ganov.',
  },
  breadcrumb: { principles: 'Principles', blog: 'Blog' },
  pager: { previous: '← Previous', next: 'Next →' },
  aside: { provenance: 'Provenance', tags: 'Tags', related: 'Related' },
  article: { principleLabel: 'Principle.' },
  severity: {
    'non-negotiable': 'Non-negotiable',
    strong: 'Strong',
    preferred: 'Preferred',
    context: 'Contextual',
  },
  filter: {
    placeholder: 'Filter practices…',
    label: 'Filter practices',
    empty: 'No practices match your filter.',
    byTag: 'Filter by tag',
  },
  toc: { onThisPage: 'On this page', close: 'Close contents' },
  theme: { toggle: 'Toggle colour theme' },
  card: { onePractice: '1 practice', manyPractices: '{count} practices' },
};

// Full per-locale overrides land here during translation. Until then a locale
// falls back to English, so routing works for every language immediately.
const overrides: Readonly<Partial<Record<Locale, UIStrings>>> = {};

export const t = (locale: Locale): UIStrings => overrides[locale] ?? overrides[defaultLocale] ?? en;
