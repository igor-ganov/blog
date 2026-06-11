// @ts-check
import { defineConfig } from 'astro/config';
import rehypeBase from './rehype-base.mjs';

// Deployed to GitHub Pages as a project site: https://igor-ganov.github.io/blog/.
// `base` must match the repo name; internal links go through withBase / rehypeBase
// so they resolve under the subpath. Change both `site` and `base` for a custom domain.
const base = '/blog';

// Static output: the whole knowledge base is content — no server needed.
// This keeps first paint well under 1s and sidesteps the @astrojs/lit
// SSR-on-Workers crash (HTMLElement is not defined) documented in the KB:
// Lit islands are loaded client-side via <script>, never SSR-rendered.
export default defineConfig({
  site: 'https://igor-ganov.github.io',
  base,
  output: 'static',
  trailingSlash: 'never',
  build: {
    // Content-hashed asset filenames — immutable caching done right (see KB).
    assets: 'assets',
  },
  markdown: {
    shikiConfig: {
      theme: 'github-dark',
      wrap: true,
    },
    // Prefix in-prose root-absolute links (/kb/...) with the base at build time.
    rehypePlugins: [[rehypeBase, { base }]],
  },
});
