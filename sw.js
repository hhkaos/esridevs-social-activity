const CACHE_VERSION = 'v43';
const SHELL_ASSET_VERSION = CACHE_VERSION;
importScripts(`./sw-update-utils.js?v=${SHELL_ASSET_VERSION}`);

const SHELL_CACHE = `esridevs-shell-${CACHE_VERSION}`;

const SHELL_ASSETS = [
  './',
  './index.html',
  `./style.css?v=${SHELL_ASSET_VERSION}`,
  `./activity-utils.js?v=${SHELL_ASSET_VERSION}`,
  `./load-table.js?v=${SHELL_ASSET_VERSION}`,
  `./apply-filters.js?v=${SHELL_ASSET_VERSION}`,
  `./charts.js?v=${SHELL_ASSET_VERSION}`,
  `./sw-update-utils.js?v=${SHELL_ASSET_VERSION}`,
  `./cookie-consent.js?v=${SHELL_ASSET_VERSION}`,
  `./analytics.js?v=${SHELL_ASSET_VERSION}`,
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

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isNavigationRequest = (
    typeof self.swUpdateUtils?.isNavigationRequest === 'function'
      ? self.swUpdateUtils.isNavigationRequest
      : (request) => request?.mode === 'navigate' || request?.destination === 'document'
  );
  const queueCachePut = (
    typeof self.swUpdateUtils?.queueCachePut === 'function'
      ? self.swUpdateUtils.queueCachePut
      : ({ response }) => !!response?.ok
  );

  // API calls are handled by client-side caching — let them pass through
  if (url.hostname === 'opensheet.elk.sh') return;

  // Network-first for app shell navigation to reduce stale index.html issues.
  if (isNavigationRequest(event.request)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          queueCachePut({
            event,
            cacheName: SHELL_CACHE,
            request: event.request,
            response,
          });
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          if (cached) return cached;
          return caches.match('./index.html');
        })
    );
    return;
  }

  // Cache-first for same-origin assets (HTML, CSS, JS)
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          queueCachePut({
            event,
            cacheName: SHELL_CACHE,
            request: event.request,
            response,
          });
          return response;
        });
      })
    );
  }
});
