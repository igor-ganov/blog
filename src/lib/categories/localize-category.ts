import type { Category, CategorySlug } from '@/lib/categories/categories';
import { defaultLocale, type Locale } from '@/lib/i18n/locales';

// Display strings for a category in one language. The slug stays language-neutral
// (it is the route and content-folder identifier); only the prose is translated.
export interface CategoryText {
  readonly title: string;
  readonly tagline: string;
  readonly description: string;
}

// Per-locale overrides land here during translation. A missing locale (or key)
// falls back to the English text carried on the Category itself.
const translations: Readonly<
  Partial<Record<Locale, Readonly<Partial<Record<CategorySlug, CategoryText>>>>>
> = {};

export const localizeCategory = (category: Category, locale: Locale): CategoryText => {
  const localized = locale === defaultLocale ? undefined : translations[locale]?.[category.slug];
  return (
    localized ?? {
      title: category.title,
      tagline: category.tagline,
      description: category.description,
    }
  );
};
