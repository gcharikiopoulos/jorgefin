// Service worker, generated at build time from src/sw.template.js.
// Caches the app shell (versioned per deploy). Page loads go to the network
// first, so a new deploy shows on the next open; the cache is the offline
// fallback. Requests to other origins (Neon Data API, Neon Auth, Google) are
// never intercepted.

const CACHE_NAME = 'finance-shell-__CACHE_VERSION__';
const SHELL = __SHELL_FILES__;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('finance-shell-') && k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  if (request.method !== 'GET' || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;

  // Page loads (any query, e.g. ?mock=1 or the auth verifier): the latest shell,
  // or the cached one when offline.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request, { cache: 'no-store' }).catch(() => caches.match('./')));
    return;
  }
  event.respondWith(caches.match(request, { ignoreSearch: true }).then((cached) => cached || fetch(request)));
});
