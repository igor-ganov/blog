import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

// Every locale must carry every key. The build also enforces this via zod, but a
// fast unit test catches drift (a translation that forgot a key) without a build.
const locales = ['en', 'it', 'ru'] as const;

const keysOf = (value: unknown, prefix = ''): readonly string[] => {
  if (value === null || typeof value !== 'object') return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    keysOf(child, prefix === '' ? key : `${prefix}.${key}`),
  );
};

const frontmatter = (raw: string): unknown => parse(raw.split('---')[1] ?? '');

describe('i18n completeness', () => {
  it('chrome labels have identical keys in every locale', () => {
    const [en, it, ru] = locales.map((locale) =>
      [...keysOf(parse(readFileSync(`src/content/i18n/${locale}.yml`, 'utf8')))].sort(),
    );
    expect(it).toEqual(en);
    expect(ru).toEqual(en);
  });

  it('every page has identical frontmatter keys in every locale', () => {
    const pages = readdirSync('src/content/pages/en').filter((file) => file.endsWith('.md'));
    for (const page of pages) {
      const [en, it, ru] = locales.map((locale) =>
        [
          ...keysOf(frontmatter(readFileSync(`src/content/pages/${locale}/${page}`, 'utf8'))),
        ].sort(),
      );
      expect(it, `${page} (it)`).toEqual(en);
      expect(ru, `${page} (ru)`).toEqual(en);
    }
  });
});
