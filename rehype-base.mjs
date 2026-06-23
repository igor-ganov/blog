// Rewrites root-absolute links and image sources in rendered markdown so they
// resolve under the deploy base (e.g. /blog) AND under the article's language
// prefix (e.g. /en) on GitHub Pages. This keeps the 100+ in-prose `/principles/...`
// links in the articles untouched in source — both prefixes are applied at build time.
// External (http, //) and in-page (#) links are left alone.

const LINK_PROP = { a: 'href', area: 'href', link: 'href', img: 'src', source: 'src' };

// App routes that live under a language prefix. Everything else that is
// root-absolute (e.g. /favicon.svg) only gets the deploy base, never a locale.
const APP_ROUTE = /^\/(principles|blog|c|skills|about)(\/|$)/;

const isInternalRoot = (value) =>
  typeof value === 'string' && value.startsWith('/') && !value.startsWith('//');

const isAppRoute = (value) => value === '/' || APP_ROUTE.test(value);

const localeOf = (file) => {
  const path = String(file?.path ?? file?.history?.at?.(-1) ?? '').replace(/\\/g, '/');
  const match = path.match(/\/content\/(?:kb|blog)\/([a-z]{2})\//);
  return match?.[1];
};

const withLocale = (locale, value) => {
  if (locale === undefined || !isAppRoute(value)) return value;
  return value === '/' ? `/${locale}` : `/${locale}${value}`;
};

const prefixed = (base, value) =>
  value === base || value.startsWith(`${base}/`) ? value : `${base}${value}`;

const walk = (node, visit) => {
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
};

export default function rehypeBase(options = {}) {
  const base = String(options.base ?? '').replace(/\/+$/, '');
  return (tree, file) => {
    const locale = localeOf(file);
    walk(tree, (node) => {
      if (node.type !== 'element') return;
      const prop = LINK_PROP[node.tagName];
      if (prop === undefined) return;
      const value = node.properties?.[prop];
      if (!isInternalRoot(value)) return;
      const localized = withLocale(locale, value);
      node.properties[prop] = base.length === 0 ? localized : prefixed(base, localized);
    });
  };
}
