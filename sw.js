// Service worker: caches the app shell, cache-first. Bump CACHE_VERSION on every
// deploy so the new shell is fetched; it is used from the next launch.
// Requests to the Neon Data API and Auth hosts (any other origin) are never
// intercepted, so they always go to the network.

const CACHE_VERSION = 'v2';
const CACHE_NAME = `finance-shell-${CACHE_VERSION}`;

const SHELL = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'api.js',
  'config.js',
  'mock.js',
  'vendor/neon-js-0.7.0-beta.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
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

  // Only same-origin GETs inside the app's scope. Everything else (Neon, Google) is untouched.
  if (request.method !== 'GET' || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;

  // Page loads (with any query, e.g. ?mock=1 or the auth verifier) get the cached shell.
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('index.html').then((cached) => cached || fetch(request)),
    );
    return;
  }

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) => cached || fetch(request)),
  );
});
