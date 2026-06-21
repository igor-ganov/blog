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

const it: UIStrings = {
  skipToContent: 'Vai al contenuto',
  brand: 'Pratiche di ingegneria',
  titleSuffix: 'Pratiche di ingegneria',
  language: 'Lingua',
  nav: { blog: 'Blog', principles: 'Principi', skills: 'Competenze', about: 'Informazioni' },
  footer: {
    lede: 'Una base di conoscenza viva: pratiche di ingegneria distillate da decisioni reali di progetto. Le decisioni più recenti prevalgono sulle precedenti e ogni affermazione porta la sua provenienza.',
    meta: 'Costruito con Astro 5, Lit, TypeScript rigoroso e Biome: lo stesso stack e le stesse regole che documenta. © {year} Igor Ganov.',
  },
  breadcrumb: { principles: 'Principi', blog: 'Blog' },
  pager: { previous: '← Precedente', next: 'Successivo →' },
  aside: { provenance: 'Provenienza', tags: 'Tag', related: 'Correlati' },
  article: { principleLabel: 'Principio.' },
  severity: {
    'non-negotiable': 'Non negoziabile',
    strong: 'Forte',
    preferred: 'Preferito',
    context: 'Contestuale',
  },
  filter: {
    placeholder: 'Filtra le pratiche…',
    label: 'Filtra le pratiche',
    empty: 'Nessuna pratica corrisponde al filtro.',
    byTag: 'Filtra per tag',
  },
  toc: { onThisPage: 'In questa pagina', close: 'Chiudi i contenuti' },
  theme: { toggle: 'Cambia tema' },
  card: { onePractice: '1 pratica', manyPractices: '{count} pratiche' },
};

const ru: UIStrings = {
  skipToContent: 'Перейти к содержимому',
  brand: 'Инженерные практики',
  titleSuffix: 'Инженерные практики',
  language: 'Язык',
  nav: { blog: 'Блог', principles: 'Принципы', skills: 'Навыки', about: 'О проекте' },
  footer: {
    lede: 'Живая база знаний: инженерные практики, выведенные из реальных проектных решений. Новые решения отменяют старые, и у каждого утверждения есть источник.',
    meta: 'Собрано на Astro 5, Lit, строгом TypeScript и Biome — на том же стеке и тех же правилах, которые описывает. © {year} Igor Ganov.',
  },
  breadcrumb: { principles: 'Принципы', blog: 'Блог' },
  pager: { previous: '← Назад', next: 'Вперёд →' },
  aside: { provenance: 'Источник', tags: 'Теги', related: 'Связанные' },
  article: { principleLabel: 'Принцип.' },
  severity: {
    'non-negotiable': 'Без компромиссов',
    strong: 'Строго',
    preferred: 'Предпочтительно',
    context: 'По контексту',
  },
  filter: {
    placeholder: 'Фильтр практик…',
    label: 'Фильтровать практики',
    empty: 'Ничего не найдено.',
    byTag: 'Фильтр по тегу',
  },
  toc: { onThisPage: 'Содержание', close: 'Закрыть содержание' },
  theme: { toggle: 'Переключить тему' },
  card: { onePractice: '1 практика', manyPractices: 'практик: {count}' },
};

// Per-locale overrides; a missing locale falls back to English.
const overrides: Readonly<Partial<Record<Locale, UIStrings>>> = { it, ru };

export const t = (locale: Locale): UIStrings => overrides[locale] ?? overrides[defaultLocale] ?? en;
