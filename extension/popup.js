/**
 * popup.js — Logic for the extension popup.
 *
 * On open:
 *  - Reads lastKnownUnreadCount and lastRefreshedAt from storage and renders them.
 *  - Merges currentItemKeys into seenItemKeys (marks all currently-known items as seen).
 *  - Clears the badge.
 *
 * Buttons:
 *  - "Open feed" → opens targetBaseUrl with:
 *      ?state=<lzstring>  — user's configured filters pre-applied (same format as web app share)
 *      &newItems=<btoa>   — URLs of unseen items so the web app renders "New" badges on them
 *    If no filters are configured (everything "All"), ?state= is omitted.
 *    If no new items exist, ?newItems= is omitted.
 *  - "Refresh now" → sends a message to the background service worker and updates the display.
 *  - Settings (⚙) → opens the options page.
 *
 * Depends on LZString being loaded as a global script (lzstring.min.js) before this module.
 */

import { toISODateString, hasNoFilters, buildWebAppState } from './filter-utils.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

function timeAgo(isoString) {
  if (!isoString) return 'Never refreshed';
  const diffMs = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes === 1) return '1 minute ago';
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return '1 hour ago';
  if (hours < 24) return `${hours} hours ago`;
  return 'More than a day ago';
}

function updateDisplay(count, lastRefreshedAt) {
  const countEl = document.querySelector('#count-number');
  const labelEl = document.querySelector('#count-label');
  const timeEl  = document.querySelector('#refresh-time');

  countEl.textContent = count;
  countEl.classList.toggle('has-items', count > 0);
  labelEl.textContent = count === 1 ? 'new item' : 'new items';
  timeEl.textContent  = `Last refresh: ${timeAgo(lastRefreshedAt)}`;
}

function setRefreshBtnState(btn, loading) {
  btn.disabled = loading;
  const icon = btn.querySelector('.btn-icon');
  if (icon) icon.classList.toggle('spinning', loading);
  btn.querySelector('.btn-text').textContent = loading ? 'Refreshing…' : 'Refresh now';
}

/**
 * Build the "Open feed" URL combining:
 *  - ?state=    LZString-encoded web-app flags (only when filters are configured)
 *  - ?newItems= btoa-encoded JSON array of unseen item URLs (only when there are new items)
 *
 * LZString is loaded as a global via popup.html <script src="lzstring.min.js">.
 */
function buildOpenFeedUrl(baseUrl, filters, newItemUrls) {
  const url = new URL(baseUrl ?? 'https://hhkaos.github.io/esridevs-social-activity/');

  if (!hasNoFilters(filters)) {
    const state = buildWebAppState(filters);
    url.searchParams.set('state', LZString.compressToBase64(JSON.stringify(state)));
  }

  if (Array.isArray(newItemUrls) && newItemUrls.length > 0) {
    url.searchParams.set('newItems', btoa(JSON.stringify(newItemUrls)));
  }

  return url.toString();
}

// ── Main ───────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  // ── Read initial state ────────────────────────────────────────────────────
  const [syncStored, localStored] = await Promise.all([
    chrome.storage.sync.get(['lastKnownUnreadCount', 'lastRefreshedAt', 'targetBaseUrl', 'filters']),
    chrome.storage.local.get(['currentItemKeys', 'seenItemKeys', 'newItemUrls']),
  ]);

  const count = syncStored.lastKnownUnreadCount ?? 0;
  updateDisplay(count, syncStored.lastRefreshedAt ?? null);

  // ── Mark as seen ──────────────────────────────────────────────────────────
  const prevSeen = localStored.seenItemKeys ?? [];
  const current  = localStored.currentItemKeys ?? [];
  const merged   = [...new Set([...prevSeen, ...current])];
  await chrome.storage.local.set({ seenItemKeys: merged });

  const today = toISODateString(new Date());
  await chrome.storage.sync.set({ lastSeenPublishedAt: today });

  chrome.action.setBadgeText({ text: '' });

  // ── Open feed ─────────────────────────────────────────────────────────────
  document.querySelector('#open-feed-btn').addEventListener('click', async () => {
    const { targetBaseUrl, filters } = await chrome.storage.sync.get(['targetBaseUrl', 'filters']);
    const { newItemUrls } = await chrome.storage.local.get('newItemUrls');
    const feedUrl = buildOpenFeedUrl(targetBaseUrl, filters, newItemUrls);
    chrome.tabs.create({ url: feedUrl });
    window.close();
  });

  // ── Refresh now ───────────────────────────────────────────────────────────
  const refreshBtn = document.querySelector('#refresh-btn');
  refreshBtn.innerHTML = '<span class="btn-icon">↻</span> <span class="btn-text">Refresh now</span>';

  refreshBtn.addEventListener('click', async () => {
    setRefreshBtnState(refreshBtn, true);
    try {
      await chrome.runtime.sendMessage({ type: 'refresh' });
    } catch {
      // Service worker may have gone inactive; message failure is non-fatal.
    }
    const updated = await chrome.storage.sync.get(['lastKnownUnreadCount', 'lastRefreshedAt']);
    updateDisplay(updated.lastKnownUnreadCount ?? 0, updated.lastRefreshedAt ?? null);
    setRefreshBtnState(refreshBtn, false);
  });

  // ── Settings ──────────────────────────────────────────────────────────────
  document.querySelector('#settings-btn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });
});
