import type { Locale } from '@/lib/i18n/locales';
import { withBase } from '@/lib/url/with-base';

// Build an internal href for a given locale: withLocale('en', '/principles') -> /<base>/en/principles,
// withLocale('it', '/') -> /<base>/it. Every in-app link goes through here so the
// locale prefix and the deploy base are applied in one place.
export const withLocale = (locale: Locale, path = '/'): string => {
  const suffix = path === '/' ? '' : path;
  return withBase(`/${locale}${suffix}`);
};
