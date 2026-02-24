const CACHE_VERSION = 'v3';
const SHELL_CACHE = `esridevs-shell-${CACHE_VERSION}`;

const SHELL_ASSETS = [
  './',
  './index.html',
  './style.css',
  './load-table.js',
  './apply-filters.js',
  './charts.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== SHELL_CACHE).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // API calls are handled by client-side caching — let them pass through
  if (url.hostname === 'opensheet.elk.sh') return;

  // Cache-first for same-origin assets (HTML, CSS, JS)
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.ok) {
            caches.open(SHELL_CACHE).then(cache => cache.put(event.request, response.clone()));
          }
          return response;
        });
      })
    );
  }
});
