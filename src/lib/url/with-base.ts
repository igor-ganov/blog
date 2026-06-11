// Internal links must work both at the domain root (dev, custom domain) and under
// a GitHub Pages project subpath (e.g. /blog). Astro auto-prefixes its own bundled
// assets with `base`, but not hand-written hrefs — so every internal link goes
// through here. `joinBase` is the pure core; `withBase` binds it to the build-time base.

export const joinBase = (base: string, path: string): string => {
  const trimmedBase = base.replace(/\/+$/, '');
  const rootedPath = `/${path}`.replace(/\/{2,}/g, '/');
  return `${trimmedBase}${rootedPath}`;
};

// import.meta.env.BASE_URL is '/blog/' in the deployed build and '/' (or undefined
// under Vitest) everywhere else, where joinBase degrades to a no-op.
export const withBase = (path: string): string => joinBase(import.meta.env.BASE_URL ?? '/', path);
