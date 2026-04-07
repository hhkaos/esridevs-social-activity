/**
 * background.js — MV3 service worker for EsriDevs Social Activity extension.
 *
 * Responsibilities:
 *  - Periodic badge refresh via chrome.alarms (default: every 15 minutes).
 *  - Fetches activity data from the opensheet API.
 *  - Counts new items that match the user's configured filters.
 *  - Updates the action badge with the unread count.
 *  - Optionally fires an OS notification when new items arrive (Phase 5).
 *  - Responds to messages from the popup (manual refresh, get count).
 *
 * New-item detection uses key-set tracking (chrome.storage.local):
 *  - Each item is identified by its URL (itemKey).
 *  - An item is "new" when its key is absent from seenItemKeys.
 *  - This correctly detects items added retroactively with old dates.
 *
 * chrome.storage.local keys (not sync — potentially large):
 *  - seenItemKeys:    string[]  URLs of items the user has seen.
 *  - currentItemKeys: string[]  All countable item URLs from the last fetch.
 *  - newItemUrls:     string[]  URLs of unseen items matching active filters (for "Open feed" badges).
 */

import {
  countNewItemsByKey,
  collectItemKeys,
  collectUnseenItemUrls,
  findLatestDate,
  isItemNew,
  isCountableRow,
  itemKey,
  toISODateString,
} from './filter-utils.js';

const SPREADSHEET_ID = '1oKkHCNbOUpfERu1xC4ePU2XwDSvalEfE0YmTN39cyNg';
const ACTIVITY_URL = `https://opensheet.elk.sh/${SPREADSHEET_ID}/Activity`;
const ALARM_NAME = 'esridevs-refresh';
const BADGE_COLOR = '#007AC2'; // Esri blue

const DEFAULT_SETTINGS = {
  refreshIntervalMinutes: 15,
  filters: {
    technologies: [],
    categories: [],
    channels: [],
    authors: [],
    contributors: [],
    languages: [],
  },
  lastSeenPublishedAt: null,
  lastKnownUnreadCount: 0,
  lastRefreshedAt: null,
  targetBaseUrl: 'https://hhkaos.github.io/esridevs-social-activity/',
  notificationsEnabled: false,
};

// ── Install / startup ──────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  // Merge defaults with any existing values (preserve user settings on update).
  const existing = await chrome.storage.sync.get(null);
  await chrome.storage.sync.set({ ...DEFAULT_SETTINGS, ...existing });

  const { refreshIntervalMinutes } = await chrome.storage.sync.get('refreshIntervalMinutes');
  await setupAlarm(refreshIntervalMinutes ?? DEFAULT_SETTINGS.refreshIntervalMinutes);

  // On first install: save all current item keys as seenItemKeys so the badge
  // starts at 0 instead of showing all historical items as "new".
  if (reason === 'install' && !existing.lastSeenPublishedAt) {
    await chrome.storage.sync.set({ lastSeenPublishedAt: toISODateString(new Date()) });
    await initializeSeenKeys();
  }
});

chrome.runtime.onStartup.addListener(() => {
  refreshBadge();
});

// ── Alarm ──────────────────────────────────────────────────────────────────────

async function setupAlarm(intervalMinutes) {
  await chrome.alarms.clear(ALARM_NAME);
  chrome.alarms.create(ALARM_NAME, {
    delayInMinutes: intervalMinutes,
    periodInMinutes: intervalMinutes,
  });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) refreshBadge();
});

// ── Storage change listener ────────────────────────────────────────────────────
// Re-run badge + reset alarm when the user saves new settings from the options page.

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  if (changes.refreshIntervalMinutes) {
    setupAlarm(changes.refreshIntervalMinutes.newValue);
  }
  if (changes.filters || changes.refreshIntervalMinutes) {
    refreshBadge();
  }
});

// ── Fetch ──────────────────────────────────────────────────────────────────────

async function fetchActivityRows() {
  const res = await fetch(ACTIVITY_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * On first install, fetch the feed and save all item keys as seenItemKeys so
 * the badge starts at 0 (no false positives from historical items).
 */
async function initializeSeenKeys() {
  try {
    const rows = await fetchActivityRows();
    const keys = collectItemKeys(rows);
    await chrome.storage.local.set({
      seenItemKeys: keys,
      currentItemKeys: keys,
      newItemUrls: [],
    });
    // Keep lastSeenPublishedAt for backward compatibility.
    const latest = findLatestDate(rows);
    if (latest) {
      await chrome.storage.sync.set({ lastSeenPublishedAt: latest });
    }
  } catch {
    // Non-critical: badge will start at 0 (today's date was already stored above).
  }
}

// ── Badge refresh ──────────────────────────────────────────────────────────────

async function refreshBadge() {
  const [syncStored, localStored] = await Promise.all([
    chrome.storage.sync.get([
      'filters',
      'lastSeenPublishedAt',
      'lastKnownUnreadCount',
      'notificationsEnabled',
    ]),
    chrome.storage.local.get(['seenItemKeys']),
  ]);

  const {
    filters = DEFAULT_SETTINGS.filters,
    lastSeenPublishedAt = null,
    lastKnownUnreadCount = 0,
    notificationsEnabled = false,
  } = syncStored;

  let rows;
  try {
    rows = await fetchActivityRows();
  } catch {
    // Network failure: retain the last known badge rather than showing 0.
    setBadge(lastKnownUnreadCount);
    return;
  }

  // Build current key set for "mark as seen" later in the popup.
  const currentItemKeys = collectItemKeys(rows);

  // Resolve the seenKeys Set.
  // Migration path: if seenItemKeys has never been saved (first run after upgrading
  // from date-based detection), bootstrap it from the existing lastSeenPublishedAt
  // so items already seen by the user don't re-appear as "new".
  let seenKeySet;
  if (localStored.seenItemKeys == null) {
    // Treat every item whose date is on or before lastSeenPublishedAt as already seen.
    const seenByDate = rows
      .filter((row) => isCountableRow(row) && !isItemNew(row, lastSeenPublishedAt))
      .map((row) => itemKey(row))
      .filter(Boolean);
    seenKeySet = new Set(seenByDate);
    // Persist so subsequent refreshes use key-set detection directly.
    await chrome.storage.local.set({ seenItemKeys: seenByDate });
  } else {
    seenKeySet = new Set(localStored.seenItemKeys);
  }

  const count = countNewItemsByKey(rows, seenKeySet, filters);
  const newItemUrls = collectUnseenItemUrls(rows, seenKeySet, filters);

  await Promise.all([
    chrome.storage.sync.set({ lastKnownUnreadCount: count, lastRefreshedAt: new Date().toISOString() }),
    chrome.storage.local.set({ currentItemKeys, newItemUrls }),
  ]);

  setBadge(count);

  // Optional OS notification (Phase 5 — requires 'notifications' permission).
  if (notificationsEnabled && count > lastKnownUnreadCount) {
    chrome.notifications?.create('new-items', {
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'Esri Developer Content Tracker',
      message: `${count} new item${count !== 1 ? 's' : ''} matching your filters`,
    });
  }
}

function setBadge(count) {
  chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
  chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
}

// ── Message API (used by popup) ────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'refresh') {
    refreshBadge()
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true; // keep channel open for async response
  }

  if (msg.type === 'getState') {
    chrome.storage.sync
      .get(['lastKnownUnreadCount', 'lastSeenPublishedAt', 'lastRefreshedAt', 'targetBaseUrl'])
      .then(sendResponse);
    return true;
  }
});
