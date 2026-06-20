// The site speaks three languages, each served under its own URL prefix
// (/en, /it, /ru); the root redirects to the default. This module is the single
// source of truth for which locales exist — routing, the language switcher, and
// the content loaders all derive from it.

export const locales = ['en', 'it', 'ru'] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

// Endonyms for the language switcher — each language named in its own words.
export const localeLabels: Readonly<Record<Locale, string>> = {
  en: 'English',
  it: 'Italiano',
  ru: 'Русский',
};

export const isLocale = (value: string): value is Locale =>
  (locales as readonly string[]).includes(value);

// Split a content id like "en/typescript/no-casting" into its locale and the
// locale-independent rest ("typescript/no-casting"), which stays stable across
// translations so `related` ids and routes line up between languages.
export const splitLocaleId = (id: string): { readonly locale: Locale; readonly rest: string } => {
  const [head = '', ...tail] = id.split('/');
  return isLocale(head)
    ? { locale: head, rest: tail.join('/') }
    : { locale: defaultLocale, rest: id };
};
