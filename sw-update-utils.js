(function (global) {
  const shouldShowUpdatePrompt = ({ workerState, hasController }) => (
    workerState === 'installed' && !!hasController
  );

  const isNavigationRequest = (request) => (
    request?.mode === 'navigate' || request?.destination === 'document'
  );

  const api = {
    shouldShowUpdatePrompt,
    isNavigationRequest,
  };

  global.swUpdateUtils = Object.assign({}, global.swUpdateUtils || {}, api);

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : self));
