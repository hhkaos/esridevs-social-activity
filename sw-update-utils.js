(function (global) {
  const shouldShowUpdatePrompt = ({ workerState, hasController }) => (
    workerState === 'installed' && !!hasController
  );

  const isNavigationRequest = (request) => (
    request?.mode === 'navigate' || request?.destination === 'document'
  );

  const queueCachePut = ({ event, cachesApi, cacheName, request, response }) => {
    if (!response?.ok) return false;

    let responseClone;
    try {
      responseClone = response.clone();
    } catch {
      return false;
    }

    const cacheSource = cachesApi || global.caches;
    if (!cacheSource?.open || !cacheName || !request) return false;

    const cacheWrite = cacheSource
      .open(cacheName)
      .then((cache) => cache.put(request, responseClone));

    if (event?.waitUntil) {
      event.waitUntil(cacheWrite.catch(() => {}));
    } else {
      cacheWrite.catch(() => {});
    }

    return true;
  };

  const api = {
    shouldShowUpdatePrompt,
    isNavigationRequest,
    queueCachePut,
  };

  global.swUpdateUtils = Object.assign({}, global.swUpdateUtils || {}, api);

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : self));
