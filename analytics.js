/**
 * analytics.js
 *
 * Opt-in analytics instrumentation for GA4.
 * Attaches its own event listeners on top of existing DOM elements — does NOT
 * modify any app logic. All calls are gated: nothing fires unless window.gtag
 * is present (which cookie-consent.js only injects after explicit consent).
 *
 * ── Events ───────────────────────────────────────────────────────────────────
 *
 * tab_viewed
 *   Fired when the user opens the Insights tab.
 *   tab_name: "insights"
 *
 * filter_applied
 *   Fired when the user actively restricts results with a filter.
 *   Not fired when a filter is cleared (empty = "no restriction").
 *   filter_type:   "topics" | "content_type" | "channel" | "author" |
 *                  "contributors" | "language" | "date_preset" | "featured_only"
 *   filter_values: comma-separated selected values (e.g. "JavaScript,Python")
 *                  for date_preset: the preset key (e.g. "last30", "thisYear")
 *                  for featured_only: "on" | "off"
 *
 * social_share
 *   Fired when the user clicks a social share button on a content row.
 *   platform:     "linkedin" | "x" | "bluesky"
 *   content_type: value of the row's Category column (e.g. "Blog post")
 *
 * share_view_copied
 *   Fired when the user copies a shareable URL of the current filter state.
 *   (no extra parameters)
 *
 * ─────────────────────────────────────────────────────────────────────────────
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
