/**
 * cookie-consent.js
 *
 * Lightweight GDPR-compliant analytics consent manager.
 * - Default: no tracking (opt-in).
 * - Persists choice to localStorage key `esridevs_cookie_consent`.
 * - Exposes window.cookieConsent for external use (e.g. footer "Cookie settings" link).
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'esridevs_cookie_consent';
  const GA_ID = 'G-K8DSSYQDTJ';

  // ── GA loader ─────────────────────────────────────────────────────────────

  function loadGA() {
    if (document.getElementById('ga-script')) return; // already loaded

    const s = document.createElement('script');
    s.id = 'ga-script';
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
    document.head.appendChild(s);

    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', GA_ID, { anonymize_ip: true });
  }

  // ── Consent state ─────────────────────────────────────────────────────────

  function getConsent() {
    try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
  }

  function saveConsent(value) {
    try { localStorage.setItem(STORAGE_KEY, value); } catch {}
  }

  function accept() {
    saveConsent('accepted');
    hideBanner();
    loadGA();
  }

  function decline() {
    saveConsent('declined');
    hideBanner();
  }

  function revoke() {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    showBanner();
  }

  // ── Banner DOM ─────────────────────────────────────────────────────────────

  function hideBanner() {
    const el = document.getElementById('cookie-consent-banner');
    if (el) el.hidden = true;
  }

  function showBanner() {
    const el = document.getElementById('cookie-consent-banner');
    if (el) el.hidden = false;
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  function init() {
    const consent = getConsent();

    if (consent === 'accepted') {
      loadGA();
      return; // banner not needed
    }

    if (consent === 'declined') {
      return; // banner not needed, respect choice
    }

    // No decision yet — show banner after DOM is ready
    const run = () => {
      showBanner();

      document.getElementById('cookie-accept-btn')
        ?.addEventListener('click', accept);

      document.getElementById('cookie-decline-btn')
        ?.addEventListener('click', decline);
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run);
    } else {
      run();
    }
  }

  // Public API
  window.cookieConsent = { accept, decline, revoke };

  init();
})();
