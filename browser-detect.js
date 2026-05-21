/**
 * browser-detect.js
 *
 * Tiny, dependency-free browser detection used to tailor the
 * "Subscribe → Browser Extension" UI. When the visitor is on desktop Chrome,
 * the app promotes a one-click Chrome Web Store install instead of the manual
 * "load unpacked" instructions.
 *
 * Dual-exported (CommonJS + global) so the pure logic can be unit tested in
 * Node without a DOM.
 */
(function (root) {
  'use strict';

  /**
   * Returns true when the current browser can install the extension from the
   * Chrome Web Store in one click — i.e. desktop Chrome (or a Chromium build
   * that reports as Chrome). Microsoft Edge and Opera are excluded: they use
   * their own stores and need an extra opt-in to install from the CWS. Brave
   * reports as plain Chrome and installs from the CWS natively, so it counts.
   * Mobile browsers are excluded because they cannot install extensions.
   *
   * Prefers the modern `navigator.userAgentData` (User-Agent Client Hints) and
   * falls back to parsing `navigator.userAgent`.
   *
   * @param {object} [nav=navigator] navigator-like object with optional
   *   `userAgentData` and/or `userAgent`.
   * @returns {boolean}
   */
  function isChromeWebStoreBrowser(nav) {
    nav = nav || (typeof navigator !== 'undefined' ? navigator : {});
    const uaData = nav.userAgentData;

    // Extensions require a desktop browser.
    if (uaData && uaData.mobile === true) return false;

    if (uaData && Array.isArray(uaData.brands) && uaData.brands.length) {
      const joined = uaData.brands
        .map((entry) => String((entry && entry.brand) || ''))
        .join(' ');
      if (/Microsoft Edge/i.test(joined)) return false;
      if (/\bOpera\b/i.test(joined)) return false;
      return /Google Chrome|Chromium/i.test(joined);
    }

    const ua = String(nav.userAgent || '');
    if (!ua) return false;
    if (/\bEdg(?:e|A|iOS)?\//i.test(ua)) return false;       // Microsoft Edge
    if (/\bOPR\/|\bOpera\b/i.test(ua)) return false;          // Opera
    if (/\bSamsungBrowser\//i.test(ua)) return false;         // Samsung Internet
    if (/Android.*\bMobile\b|\bMobile\b.*Android/i.test(ua)) return false; // mobile Chrome
    return /\bChrome\/\d/i.test(ua);
  }

  const api = { isChromeWebStoreBrowser };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.browserDetect = api;
}(typeof globalThis !== 'undefined' ? globalThis : window));
