import { defaultLocale, type Locale } from '@/lib/i18n/locales';

// "2026-05-31" -> a localized "31 May 2026" / "31 mag 2026" / "31 мая 2026".
// Built from explicit UTC parts so the day never shifts across time zones;
// falls back to the raw input on a malformed date.
export const formatDate = (iso: string, locale: Locale = defaultLocale): string => {
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return iso;
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
};
