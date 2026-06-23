// Service worker for the GitHub Pages deploy. GitHub Pages serves every response
// with a fixed `cache-control: max-age=600`, so even content-hashed (immutable)
// assets expire after 10 minutes. This SW caches them long-term instead:
//
//   - /<base>/assets/*  -> cache-first. Filenames carry a content hash, so a cache
//                          hit is always correct; a new build means new filenames.
//   - navigations (HTML) -> network-first with a cache fallback, so online visitors
//                           always get fresh pages and offline visitors still get one.
//   - everything else    -> straight to the network.
//
// Bump CACHE_VERSION to evict all prior caches on the next activation.

const CACHE_VERSION = 'v1';
const CACHE_NAME = `ep-${CACHE_VERSION}`;

// Directory the SW is served from, e.g. "/blog/" — its natural control scope.
const SCOPE = new URL('./', self.location).pathname;
const ASSETS_PREFIX = `${SCOPE}assets/`;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

const cacheFirst = async (request) => {
  const cache = await caches.open(CACHE_NAME);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
};

const networkFirst = async (request) => {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const hit = await cache.match(request);
    if (hit) return hit;
    throw error;
  }
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith(ASSETS_PREFIX)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
  }
});
