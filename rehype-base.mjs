// Rewrites root-absolute links and image sources in rendered markdown so they
// resolve under the deploy base (e.g. /blog) on GitHub Pages. This keeps the 100+
// in-prose `/kb/...` links in the articles untouched in source — the prefix is
// applied at build time. External (http, //) and in-page (#) links are left alone.

const LINK_PROP = { a: 'href', area: 'href', link: 'href', img: 'src', source: 'src' };

const isInternalRoot = (value) =>
  typeof value === 'string' && value.startsWith('/') && !value.startsWith('//');

const prefixed = (base, value) =>
  value === base || value.startsWith(`${base}/`) ? value : `${base}${value}`;

const walk = (node, visit) => {
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
};

export default function rehypeBase(options = {}) {
  const base = String(options.base ?? '').replace(/\/+$/, '');
  return (tree) => {
    if (base.length === 0) return;
    walk(tree, (node) => {
      if (node.type !== 'element') return;
      const prop = LINK_PROP[node.tagName];
      if (prop === undefined) return;
      const value = node.properties?.[prop];
      if (!isInternalRoot(value)) return;
      node.properties[prop] = prefixed(base, value);
    });
  };
}
