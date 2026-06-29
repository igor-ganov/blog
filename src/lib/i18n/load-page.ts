import { getEntry } from 'astro:content';
import { z } from 'zod';
import type { Locale } from '@/lib/i18n/locales';

// Page copy lives as one Markdown file per page per locale in the `pages`
// collection (frontmatter map of strings). Each page has its own schema here:
// it gives precise types and validates completeness at build, so a missing key
// in any locale is a build error — the contract the old typed object enforced.
const fetchPage = async (locale: Locale, name: string): Promise<unknown> => {
  const entry = await getEntry('pages', `${locale}/${name}`);
  if (entry === undefined) throw new Error(`missing page copy: ${locale}/${name}`);
  return entry.data;
};

const homeSchema = z.object({
  title: z.string(),
  description: z.string(),
  kicker: z.string(),
  h1: z.string(),
  lede: z.string(),
  statPractices: z.string(),
  statCategories: z.string(),
  statNonNegotiable: z.string(),
  blogHeading: z.string(),
  blogAll: z.string(),
  blogLede: z.string(),
  nonNegHeading: z.string(),
  nonNegLede: z.string(),
  browseHeading: z.string(),
  browseLede: z.string(),
});

const indexSchema = z.object({ description: z.string(), lede: z.string() });

const notFoundSchema = z.object({
  title: z.string(),
  description: z.string(),
  heading: z.string(),
  lede: z.string(),
  cta: z.string(),
});

const aboutSchema = z.object({
  title: z.string(),
  description: z.string(),
  lede: z.string(),
  whyHeading: z.string(),
  whyIntro: z.string(),
  why1: z.string(),
  why2: z.string(),
  why3Pre: z.string(),
  why3Post: z.string(),
  why4: z.string(),
  builtHeading: z.string(),
  built: z.string(),
  newerHeading: z.string(),
  newerPre: z.string(),
  newerLink: z.string(),
  newerPost: z.string(),
  sevHeading: z.string(),
  sevIntro: z.string(),
  sevNonNeg: z.string(),
  sevStrong: z.string(),
  sevPreferred: z.string(),
  sevContext: z.string(),
  readHeading: z.string(),
  readPre: z.string(),
  readLink: z.string(),
  readPost: z.string(),
  builtWithHeading: z.string(),
  builtWith: z.string(),
});

const skillsSchema = z.object({
  description: z.string(),
  heading: z.string(),
  lede: z.string(),
  legendExists: z.string(),
  legendRefine: z.string(),
  legendNew: z.string(),
  useWhen: z.string(),
  drawsFrom: z.string(),
  practicesWord: z.string(),
});

const appsPageSchema = z.object({
  title: z.string(),
  description: z.string(),
  heading: z.string(),
  lede: z.string(),
  codeLabel: z.string(),
  demoLabel: z.string(),
  penLabel: z.string(),
});

export const loadHome = async (locale: Locale) => homeSchema.parse(await fetchPage(locale, 'home'));
export const loadAbout = async (locale: Locale) =>
  aboutSchema.parse(await fetchPage(locale, 'about'));
export const loadSkills = async (locale: Locale) =>
  skillsSchema.parse(await fetchPage(locale, 'skills'));
export const loadAppsPage = async (locale: Locale) =>
  appsPageSchema.parse(await fetchPage(locale, 'apps'));
export const loadPrinciples = async (locale: Locale) =>
  indexSchema.parse(await fetchPage(locale, 'principles'));
export const loadBlog = async (locale: Locale) =>
  indexSchema.parse(await fetchPage(locale, 'blog'));
export const loadNotFound = async (locale: Locale) =>
  notFoundSchema.parse(await fetchPage(locale, '404'));
