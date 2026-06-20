import type { CategorySlug } from '@/lib/categories/categories';
import type { Locale } from '@/lib/i18n/locales';

export type Severity = 'non-negotiable' | 'strong' | 'preferred' | 'context';

export interface ArticleSource {
  readonly project: string;
  readonly note?: string;
  readonly date: string;
}

// A framework-agnostic view model. Astro's CollectionEntry is mapped to this
// at the page boundary so the pure functions below stay testable without Astro.
export interface Article {
  readonly id: string;
  readonly locale: Locale;
  readonly slug: string;
  readonly category: CategorySlug;
  readonly title: string;
  readonly summary: string;
  readonly principle: string;
  readonly severity: Severity;
  readonly tags: readonly string[];
  readonly sources: readonly ArticleSource[];
  readonly related: readonly string[];
  readonly order: number;
}
