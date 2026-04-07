/**
 * analytics.js
 *
 * Opt-in analytics instrumentation for GA4.
 * Attaches its own event listeners on top of existing DOM elements — does NOT
 * modify any app logic. All calls are gated: nothing fires unless window.gtag
 * is present (which cookie-consent.js only injects after explicit consent).
 *
 * Events tracked:
 *  - tab_viewed          { tab_name }
 *  - filter_applied      { filter_type, filter_values }
 *  - social_share        { platform, content_type }
 *  - share_view_copied   {}
 */
(function () {
  'use strict';

  // ── Helper ────────────────────────────────────────────────────────────────

  function track(eventName, params) {
    if (typeof window.gtag !== 'function') return;
    window.gtag('event', eventName, params || {});
  }

  // ── Tab navigation ────────────────────────────────────────────────────────

  function initTabTracking() {
    document.querySelector('#tab-trends-trigger')?.addEventListener('click', () => {
      track('tab_viewed', { tab_name: 'insights' });
    });
  }

  // ── Filter usage ──────────────────────────────────────────────────────────

  const FILTER_MAP = {
    topics:       'topics',
    category:     'content_type',
    channel:      'channel',
    author:       'author',
    contributors: 'contributors',
    language:     'language',
  };

  function getSelectedValues(selectEl) {
    return [...selectEl.options]
      .filter((o) => o.selected)
      .map((o) => o.value)
      .join(',');
  }

  function initFilterTracking() {
    Object.entries(FILTER_MAP).forEach(([id, label]) => {
      const el = document.querySelector(`#${id}`);
      if (!el) return;
      el.addEventListener('change', () => {
        const values = getSelectedValues(el);
        if (!values) return; // cleared = "no restriction", not worth tracking
        track('filter_applied', { filter_type: label, filter_values: values });
      });
    });

    // Date preset
    document.querySelector('#date-preset')?.addEventListener('change', (e) => {
      track('filter_applied', {
        filter_type: 'date_preset',
        filter_values: e.currentTarget.value,
      });
    });

    // Featured-only toggle — apply-filters.js listener runs first and flips
    // window.flags.featuredOnly, so we read the new value here.
    document.querySelector('#featured-only-toggle')?.addEventListener('click', () => {
      track('filter_applied', {
        filter_type: 'featured_only',
        filter_values: window.flags?.featuredOnly ? 'on' : 'off',
      });
    });
  }

  // ── Social share clicks ───────────────────────────────────────────────────

  function getPlatformFromClasses(el) {
    for (const cls of el.classList) {
      const m = cls.match(/^social-link--(?!menu$)(.+)$/);
      if (m) return m[1];
    }
    return null;
  }

  function getContentTypeFromRow(rowEl) {
    return rowEl?.dataset?.categories?.trim() || '';
  }

  function initSocialTracking() {
    const tableEl = document.querySelector('#main-table');
    if (!tableEl) return;

    tableEl.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      // Single platform link (or its child icon)
      const directLink = target.closest('.social-link:not(.social-link--menu)');
      if (directLink) {
        const platform = getPlatformFromClasses(directLink) || 'unknown';
        track('social_share', {
          platform,
          content_type: getContentTypeFromRow(directLink.closest('tr')),
        });
        return;
      }

      // Item inside a multi-target dropdown
      const dropdownItem = target.closest('.social-link-menu .dropdown-item');
      if (dropdownItem) {
        const menuBtn = dropdownItem.closest('.social-link-group')
          ?.querySelector('.social-link--menu');
        const platform = menuBtn ? (getPlatformFromClasses(menuBtn) || 'unknown') : 'unknown';
        track('social_share', {
          platform,
          content_type: getContentTypeFromRow(dropdownItem.closest('tr')),
        });
      }
    });
  }

  // ── Share-view URL copy ───────────────────────────────────────────────────

  function initShareViewTracking() {
    document.querySelector('#share-view-btn')?.addEventListener('click', () => {
      track('share_view_copied');
    });
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  // Scripts are deferred to end of <body>, so DOM is fully available here.
  initTabTracking();
  initFilterTracking();
  initSocialTracking();
  initShareViewTracking();
})();
