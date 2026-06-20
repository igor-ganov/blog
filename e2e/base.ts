// Mirrors `base` in astro.config.mjs — the GitHub Pages project subpath the
// preview server serves under. Tests navigate to ${BASE}/... so they exercise
// exactly what ships.
export const BASE = '/blog';

// The site is fully prefixed by language; the default locale lives under /en.
// Content-route tests navigate under APP so they hit real pages (the bare BASE
// only redirects to APP).
export const APP = `${BASE}/en`;
