// @ts-check
import { defineConfig } from 'astro/config';

// Static output: the whole knowledge base is content — no server needed.
// This keeps first paint well under 1s and sidesteps the @astrojs/lit
// SSR-on-Workers crash (HTMLElement is not defined) documented in the KB:
// Lit islands are loaded client-side via <script>, never SSR-rendered.
export default defineConfig({
  site: 'https://practices.example.dev',
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
  },
});
