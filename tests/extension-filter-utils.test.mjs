/**
 * Tests for extension/filter-utils.js
 *
 * Covers the badge count logic: new-item detection, filter matching, and edge cases.
 * These are regression tests for Phase 1 of the Chrome extension (issue #9).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeCell,
  parseDateToLocalDay,
  toISODateString,
  toSelectionMap,
  matchesSelectionMap,
  isCountableRow,
  isItemNew,
  itemMatchesFilters,
  countNewItems,
  findLatestDate,
  toWebAppFlagsObj,
  hasNoFilters,
  buildWebAppState,
  itemKey,
  collectItemKeys,
  collectUnseenItemUrls,
  isItemUnseen,
  countNewItemsByKey,
  findEarliestUnseenDate,
} from '../extension/filter-utils.js';

// ── normalizeCell ──────────────────────────────────────────────────────────────

test('normalizeCell: trims whitespace', () => {
  assert.equal(normalizeCell('  hello  '), 'hello');
});

test('normalizeCell: replaces non-breaking spaces', () => {
  assert.equal(normalizeCell('hello\u00A0world'), 'hello world');
});

test('normalizeCell: strips invisible characters', () => {
  assert.equal(normalizeCell('\u200Bhello\u200D'), 'hello');
});

test('normalizeCell: handles null and undefined', () => {
  assert.equal(normalizeCell(null), '');
  assert.equal(normalizeCell(undefined), '');
});

// ── parseDateToLocalDay ────────────────────────────────────────────────────────

test('parseDateToLocalDay: parses ISO YYYY-MM-DD', () => {
  const d = parseDateToLocalDay('2026-04-07');
  assert.ok(d instanceof Date);
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 3); // April = 3
  assert.equal(d.getDate(), 7);
});

test('parseDateToLocalDay: parses M/D/YYYY slash format', () => {
  const d = parseDateToLocalDay('4/7/2026');
  assert.ok(d instanceof Date);
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 3);
  assert.equal(d.getDate(), 7);
});

test('parseDateToLocalDay: returns null for empty string', () => {
  assert.equal(parseDateToLocalDay(''), null);
});

test('parseDateToLocalDay: returns null for invalid date', () => {
  assert.equal(parseDateToLocalDay('not-a-date'), null);
});

test('parseDateToLocalDay: returns null for impossible ISO date', () => {
  assert.equal(parseDateToLocalDay('2026-13-01'), null);
});

// ── toISODateString ────────────────────────────────────────────────────────────

test('toISODateString: formats date correctly', () => {
  assert.equal(toISODateString(new Date(2026, 3, 7)), '2026-04-07');
});

test('toISODateString: pads single-digit month and day', () => {
  assert.equal(toISODateString(new Date(2026, 0, 5)), '2026-01-05');
});

// ── toSelectionMap ─────────────────────────────────────────────────────────────

test('toSelectionMap: converts array to {value: 1} map', () => {
  assert.deepEqual(toSelectionMap(['GIS', 'Python']), { GIS: 1, Python: 1 });
});

test('toSelectionMap: returns empty object for empty array', () => {
  assert.deepEqual(toSelectionMap([]), {});
});

test('toSelectionMap: handles null/undefined gracefully', () => {
  assert.deepEqual(toSelectionMap(null), {});
  assert.deepEqual(toSelectionMap(undefined), {});
});

// ── matchesSelectionMap ────────────────────────────────────────────────────────

test('matchesSelectionMap: empty map always passes (no restriction)', () => {
  assert.ok(matchesSelectionMap({}, 'anything'));
  assert.ok(matchesSelectionMap({}, ''));
});

test('matchesSelectionMap: matches single value', () => {
  const map = { Blog: 1 };
  assert.ok(matchesSelectionMap(map, 'Blog'));
  assert.ok(!matchesSelectionMap(map, 'YouTube'));
});

test('matchesSelectionMap: splitValues splits on comma', () => {
  const map = { Python: 1 };
  assert.ok(matchesSelectionMap(map, 'JavaScript, Python', { splitValues: true }));
  assert.ok(!matchesSelectionMap(map, 'JavaScript, TypeScript', { splitValues: true }));
});

test('matchesSelectionMap: splitValues trims whitespace around tokens', () => {
  const map = { Python: 1 };
  assert.ok(matchesSelectionMap(map, '  Python  , JavaScript', { splitValues: true }));
});

test('matchesSelectionMap: returns false for empty value with active selections', () => {
  assert.ok(!matchesSelectionMap({ Blog: 1 }, ''));
  assert.ok(!matchesSelectionMap({ Blog: 1 }, null));
});

// ── isCountableRow ─────────────────────────────────────────────────────────────

test('isCountableRow: passes when title and URL are present', () => {
  assert.ok(isCountableRow({ Title: 'Hello', URL: 'https://example.com' }));
});

test('isCountableRow: fails when title is missing', () => {
  assert.ok(!isCountableRow({ Title: '', URL: 'https://example.com' }));
});

test('isCountableRow: fails when URL is missing', () => {
  assert.ok(!isCountableRow({ Title: 'Hello', URL: '' }));
});

test('isCountableRow: fails when URL is placeholder n/a', () => {
  assert.ok(!isCountableRow({ Title: 'Hello', URL: 'n/a' }));
  assert.ok(!isCountableRow({ Title: 'Hello', URL: 'N/A' }));
});

test('isCountableRow: resolves URL field aliases (Url, Link)', () => {
  assert.ok(isCountableRow({ Title: 'Hello', Url: 'https://example.com' }));
  assert.ok(isCountableRow({ Title: 'Hello', Link: 'https://example.com' }));
});

test('isCountableRow: resolves Title alias "Content title"', () => {
  assert.ok(isCountableRow({ 'Content title': 'Hello', URL: 'https://example.com' }));
});

// ── isItemNew ─────────────────────────────────────────────────────────────────

test('isItemNew: all items are new when lastSeenPublishedAt is null', () => {
  const row = { Date: '2025-01-01', Title: 'Old', URL: 'https://x.com' };
  assert.ok(isItemNew(row, null));
});

test('isItemNew: item after lastSeenPublishedAt is new', () => {
  const row = { Date: '2026-04-08' };
  assert.ok(isItemNew(row, '2026-04-07'));
});

test('isItemNew: item on same day as lastSeenPublishedAt is NOT new', () => {
  const row = { Date: '2026-04-07' };
  assert.ok(!isItemNew(row, '2026-04-07'));
});

test('isItemNew: item before lastSeenPublishedAt is NOT new', () => {
  const row = { Date: '2026-04-06' };
  assert.ok(!isItemNew(row, '2026-04-07'));
});

test('isItemNew: item with no date is NOT new (cannot confirm recency)', () => {
  const row = { Date: '' };
  assert.ok(!isItemNew(row, '2026-04-07'));
});

// ── itemMatchesFilters ────────────────────────────────────────────────────────

const makeRow = (overrides = {}) => ({
  Title: 'Test article',
  URL: 'https://example.com',
  Date: '2026-04-08',
  Author: 'Jane',
  'Topics_Product': 'ArcGIS Maps SDK',
  Category: 'Blog post',
  Channel: 'Esri Blog',
  Language: 'English',
  Contributors: 'Alice, Bob',
  ...overrides,
});

test('itemMatchesFilters: empty filters pass everything', () => {
  assert.ok(itemMatchesFilters(makeRow(), {}));
});

test('itemMatchesFilters: matching channel filter passes', () => {
  assert.ok(itemMatchesFilters(makeRow(), { channels: ['Esri Blog'] }));
});

test('itemMatchesFilters: non-matching channel filter fails', () => {
  assert.ok(!itemMatchesFilters(makeRow(), { channels: ['YouTube'] }));
});

test('itemMatchesFilters: matching author filter passes', () => {
  assert.ok(itemMatchesFilters(makeRow(), { authors: ['Jane'] }));
});

test('itemMatchesFilters: matching technology filter passes (multi-value field)', () => {
  assert.ok(itemMatchesFilters(makeRow({ 'Topics_Product': 'ArcGIS Maps SDK, ArcGIS Online' }), {
    technologies: ['ArcGIS Online'],
  }));
});

test('itemMatchesFilters: non-matching technology filter fails', () => {
  assert.ok(!itemMatchesFilters(makeRow(), { technologies: ['Unrelated SDK'] }));
});

test('itemMatchesFilters: matching contributor filter passes (multi-value field)', () => {
  assert.ok(itemMatchesFilters(makeRow(), { contributors: ['Bob'] }));
});

test('itemMatchesFilters: non-matching contributor filter fails', () => {
  assert.ok(!itemMatchesFilters(makeRow(), { contributors: ['Charlie'] }));
});

test('itemMatchesFilters: all filters must match (AND logic)', () => {
  // Matching channel but wrong language — should fail
  assert.ok(!itemMatchesFilters(makeRow(), {
    channels: ['Esri Blog'],
    languages: ['Spanish'],
  }));
  // Both matching — should pass
  assert.ok(itemMatchesFilters(makeRow(), {
    channels: ['Esri Blog'],
    languages: ['English'],
  }));
});

// ── countNewItems ─────────────────────────────────────────────────────────────

const ROWS = [
  makeRow({ Date: '2026-04-08', Channel: 'Esri Blog',  Language: 'English' }),
  makeRow({ Date: '2026-04-09', Channel: 'YouTube',     Language: 'Spanish' }),
  makeRow({ Date: '2026-04-06', Channel: 'Esri Blog',  Language: 'English' }),
  makeRow({ Date: '2026-04-08', Title: '',  URL: '' }), // non-countable
];

test('countNewItems: no filters — counts all countable rows after lastSeen', () => {
  // lastSeenPublishedAt = April 7 → rows on Apr 8 and Apr 9 are new; Apr 6 is not
  const count = countNewItems(ROWS, { lastSeenPublishedAt: '2026-04-07' });
  assert.equal(count, 2);
});

test('countNewItems: channel filter narrows the count', () => {
  const count = countNewItems(ROWS, {
    filters: { channels: ['Esri Blog'] },
    lastSeenPublishedAt: '2026-04-07',
  });
  // Only the Apr 8 Esri Blog row is new and matches; YouTube row doesn't match channel
  assert.equal(count, 1);
});

test('countNewItems: no new items when lastSeen is today', () => {
  const count = countNewItems(ROWS, { lastSeenPublishedAt: '2026-04-09' });
  assert.equal(count, 0);
});

test('countNewItems: null lastSeen counts all countable rows', () => {
  const count = countNewItems(ROWS, { lastSeenPublishedAt: null });
  assert.equal(count, 3); // 4 rows minus 1 non-countable
});

test('countNewItems: empty rows returns 0', () => {
  assert.equal(countNewItems([], { lastSeenPublishedAt: '2026-01-01' }), 0);
});

// ── findLatestDate ────────────────────────────────────────────────────────────

test('findLatestDate: returns ISO string of the most recent date', () => {
  const rows = [
    { Date: '2026-03-01' },
    { Date: '2026-04-07' },
    { Date: '2026-01-15' },
  ];
  assert.equal(findLatestDate(rows), '2026-04-07');
});

test('findLatestDate: returns null for empty array', () => {
  assert.equal(findLatestDate([]), null);
});

test('findLatestDate: skips rows with no parseable date', () => {
  const rows = [{ Date: '' }, { Date: 'invalid' }, { Date: '2026-02-10' }];
  assert.equal(findLatestDate(rows), '2026-02-10');
});

// ── toWebAppFlagsObj ───────────────────────────────────────────────────────────

test('toWebAppFlagsObj: converts array to {value: 1} map', () => {
  assert.deepEqual(toWebAppFlagsObj(['Blog post', 'YouTube']), { 'Blog post': 1, YouTube: 1 });
});

test('toWebAppFlagsObj: returns empty object for empty array', () => {
  assert.deepEqual(toWebAppFlagsObj([]), {});
});

test('toWebAppFlagsObj: returns empty object for null/undefined', () => {
  assert.deepEqual(toWebAppFlagsObj(null), {});
  assert.deepEqual(toWebAppFlagsObj(undefined), {});
});

// ── hasNoFilters ───────────────────────────────────────────────────────────────

test('hasNoFilters: returns true when all arrays are empty', () => {
  assert.ok(hasNoFilters({ technologies: [], channels: [], authors: [] }));
});

test('hasNoFilters: returns false when any array is non-empty', () => {
  assert.ok(!hasNoFilters({ technologies: ['ArcGIS'], channels: [] }));
});

test('hasNoFilters: returns true for null/undefined', () => {
  assert.ok(hasNoFilters(null));
  assert.ok(hasNoFilters(undefined));
});

// ── buildWebAppState ───────────────────────────────────────────────────────────

test('buildWebAppState: converts extension filters to web-app state format', () => {
  const filters = { technologies: ['ArcGIS'], categories: ['Blog post'], channels: [], authors: [], contributors: [], languages: [] };
  const state = buildWebAppState(filters);
  assert.deepEqual(state.filters.technologies, { ArcGIS: 1 });
  assert.deepEqual(state.filters.categories, { 'Blog post': 1 });
  assert.deepEqual(state.filters.channels, {});
  assert.equal(state.filters.datePreset, 'showAll');
  assert.deepEqual(state.filters.dateRange, { from: '', to: '' });
  assert.equal(state.filters.featuredOnly, false);
  assert.equal(state.activeTab, 'table');
});

test('buildWebAppState: empty filters produce empty flag objects', () => {
  const state = buildWebAppState({ technologies: [], categories: [], channels: [], authors: [], contributors: [], languages: [] });
  assert.deepEqual(state.filters.technologies, {});
  assert.deepEqual(state.filters.channels, {});
});

// ── itemKey ───────────────────────────────────────────────────────────────────

test('itemKey: returns lowercase URL', () => {
  assert.equal(itemKey({ Title: 'T', URL: 'https://Example.com/Page' }), 'https://example.com/page');
});

test('itemKey: returns empty string for placeholder URL', () => {
  assert.equal(itemKey({ Title: 'T', URL: 'n/a' }), '');
  assert.equal(itemKey({ Title: 'T', URL: 'N/A' }), '');
  assert.equal(itemKey({ Title: 'T', URL: 'tbd' }), '');
});

test('itemKey: returns empty string when URL is absent', () => {
  assert.equal(itemKey({ Title: 'T' }), '');
});

test('itemKey: resolves URL field aliases (Url, Link)', () => {
  assert.equal(itemKey({ Title: 'T', Url: 'https://x.com' }), 'https://x.com');
  assert.equal(itemKey({ Title: 'T', Link: 'https://y.com' }), 'https://y.com');
});

// ── collectItemKeys ────────────────────────────────────────────────────────────

test('collectItemKeys: returns URLs of all countable rows', () => {
  const rows = [
    { Title: 'A', URL: 'https://a.com' },
    { Title: 'B', URL: 'https://b.com' },
    { Title: '', URL: 'https://c.com' }, // non-countable (no title)
  ];
  assert.deepEqual(collectItemKeys(rows), ['https://a.com', 'https://b.com']);
});

test('collectItemKeys: skips rows with placeholder URLs', () => {
  const rows = [
    { Title: 'A', URL: 'https://a.com' },
    { Title: 'B', URL: 'n/a' },
  ];
  assert.deepEqual(collectItemKeys(rows), ['https://a.com']);
});

test('collectItemKeys: returns empty array for empty input', () => {
  assert.deepEqual(collectItemKeys([]), []);
});

// ── isItemUnseen ───────────────────────────────────────────────────────────────

test('isItemUnseen: returns true when seenKeys is null (first run)', () => {
  assert.ok(isItemUnseen({ Title: 'T', URL: 'https://x.com' }, null));
});

test('isItemUnseen: returns true when seenKeys is empty (first run)', () => {
  assert.ok(isItemUnseen({ Title: 'T', URL: 'https://x.com' }, new Set()));
});

test('isItemUnseen: returns true when key is not in seenKeys', () => {
  const seenKeys = new Set(['https://other.com']);
  assert.ok(isItemUnseen({ Title: 'T', URL: 'https://x.com' }, seenKeys));
});

test('isItemUnseen: returns false when key is in seenKeys', () => {
  const seenKeys = new Set(['https://x.com']);
  assert.ok(!isItemUnseen({ Title: 'T', URL: 'https://x.com' }, seenKeys));
});

test('isItemUnseen: comparison is case-insensitive (URL lowercased)', () => {
  const seenKeys = new Set(['https://x.com/page']);
  assert.ok(!isItemUnseen({ Title: 'T', URL: 'https://X.com/Page' }, seenKeys));
});

test('isItemUnseen: returns false for rows with empty key (no URL)', () => {
  // No URL → key is '' → cannot confirm it is unseen → not counted
  const seenKeys = new Set(['https://x.com']);
  assert.ok(!isItemUnseen({ Title: 'T', URL: '' }, seenKeys));
});

// ── countNewItemsByKey ─────────────────────────────────────────────────────────

const makeKeyRow = (overrides = {}) => ({
  Title: 'Test',
  URL: 'https://example.com',
  Date: '2026-01-01',
  Channel: 'Esri Blog',
  Language: 'English',
  Author: 'Jane',
  'Topics_Product': 'ArcGIS',
  Category: 'Blog post',
  Contributors: 'Alice',
  ...overrides,
});

test('countNewItemsByKey: counts rows whose URL is not in seenKeys', () => {
  const rows = [
    makeKeyRow({ URL: 'https://a.com' }),
    makeKeyRow({ URL: 'https://b.com' }),
    makeKeyRow({ URL: 'https://c.com' }),
  ];
  const seenKeys = new Set(['https://a.com']);
  assert.equal(countNewItemsByKey(rows, seenKeys), 2);
});

test('countNewItemsByKey: detects backfill item with old date not in seenKeys', () => {
  // This is the core regression: item with old date (2024-01-01) added retroactively.
  // Date-based detection would miss it; key-set detection must find it.
  const rows = [
    makeKeyRow({ URL: 'https://old-but-new.com', Date: '2024-01-01' }),
    makeKeyRow({ URL: 'https://already-seen.com', Date: '2024-01-01' }),
  ];
  const seenKeys = new Set(['https://already-seen.com']);
  assert.equal(countNewItemsByKey(rows, seenKeys), 1);
});

test('countNewItemsByKey: null seenKeys counts all countable rows', () => {
  const rows = [
    makeKeyRow({ URL: 'https://a.com' }),
    makeKeyRow({ URL: 'https://b.com' }),
    makeKeyRow({ Title: '', URL: '' }), // non-countable
  ];
  assert.equal(countNewItemsByKey(rows, null), 2);
});

test('countNewItemsByKey: applies filter when counting unseen rows', () => {
  const rows = [
    makeKeyRow({ URL: 'https://a.com', Channel: 'Esri Blog' }),
    makeKeyRow({ URL: 'https://b.com', Channel: 'YouTube' }),
  ];
  const seenKeys = new Set(); // nothing seen → all new
  assert.equal(countNewItemsByKey(rows, seenKeys, { channels: ['Esri Blog'] }), 1);
});

test('countNewItemsByKey: returns 0 when all items are seen', () => {
  const rows = [
    makeKeyRow({ URL: 'https://a.com' }),
    makeKeyRow({ URL: 'https://b.com' }),
  ];
  const seenKeys = new Set(['https://a.com', 'https://b.com']);
  assert.equal(countNewItemsByKey(rows, seenKeys), 0);
});

// ── findEarliestUnseenDate ─────────────────────────────────────────────────────

test('findEarliestUnseenDate: returns ISO date of earliest unseen item', () => {
  const rows = [
    makeKeyRow({ URL: 'https://a.com', Date: '2026-03-10' }),
    makeKeyRow({ URL: 'https://b.com', Date: '2026-01-05' }), // earlier, unseen
    makeKeyRow({ URL: 'https://c.com', Date: '2026-04-01' }),
  ];
  const seenKeys = new Set(['https://a.com']);
  assert.equal(findEarliestUnseenDate(rows, seenKeys), '2026-01-05');
});

test('findEarliestUnseenDate: returns null when all items are seen', () => {
  const rows = [makeKeyRow({ URL: 'https://a.com', Date: '2026-03-10' })];
  const seenKeys = new Set(['https://a.com']);
  assert.equal(findEarliestUnseenDate(rows, seenKeys), null);
});

test('findEarliestUnseenDate: respects filter — skips unseen rows that do not match', () => {
  const rows = [
    makeKeyRow({ URL: 'https://a.com', Date: '2026-01-01', Channel: 'YouTube' }),
    makeKeyRow({ URL: 'https://b.com', Date: '2026-03-01', Channel: 'Esri Blog' }),
  ];
  const seenKeys = new Set(); // nothing seen
  // Only Esri Blog matches — earliest unseen Esri Blog item is March
  assert.equal(findEarliestUnseenDate(rows, seenKeys, { channels: ['Esri Blog'] }), '2026-03-01');
});

test('findEarliestUnseenDate: returns null for empty rows', () => {
  assert.equal(findEarliestUnseenDate([], new Set()), null);
});

// ── collectUnseenItemUrls ──────────────────────────────────────────────────────

test('collectUnseenItemUrls: returns lowercased URLs of unseen countable items', () => {
  const rows = [
    makeKeyRow({ URL: 'https://A.com', Date: '2026-01-01' }),
    makeKeyRow({ URL: 'https://B.com', Date: '2026-02-01' }),
    makeKeyRow({ URL: 'https://C.com', Date: '2026-03-01' }),
  ];
  const seenKeys = new Set(['https://a.com']); // A already seen
  assert.deepEqual(collectUnseenItemUrls(rows, seenKeys), ['https://b.com', 'https://c.com']);
});

test('collectUnseenItemUrls: returns empty array when all items are seen', () => {
  const rows = [makeKeyRow({ URL: 'https://a.com' })];
  const seenKeys = new Set(['https://a.com']);
  assert.deepEqual(collectUnseenItemUrls(rows, seenKeys), []);
});

test('collectUnseenItemUrls: detects backfill item with old date', () => {
  const rows = [
    makeKeyRow({ URL: 'https://old-but-new.com', Date: '2020-01-01' }),
    makeKeyRow({ URL: 'https://already-seen.com', Date: '2026-04-01' }),
  ];
  const seenKeys = new Set(['https://already-seen.com']);
  assert.deepEqual(collectUnseenItemUrls(rows, seenKeys), ['https://old-but-new.com']);
});

test('collectUnseenItemUrls: respects filter — excludes unseen rows that do not match', () => {
  const rows = [
    makeKeyRow({ URL: 'https://blog.com', Channel: 'Esri Blog' }),
    makeKeyRow({ URL: 'https://yt.com', Channel: 'YouTube' }),
  ];
  const seenKeys = new Set(); // all unseen
  assert.deepEqual(collectUnseenItemUrls(rows, seenKeys, { channels: ['Esri Blog'] }), ['https://blog.com']);
});

test('collectUnseenItemUrls: skips non-countable rows', () => {
  const rows = [
    makeKeyRow({ URL: 'https://a.com' }),
    { Title: '', URL: 'https://no-title.com' }, // non-countable
  ];
  const seenKeys = new Set();
  assert.deepEqual(collectUnseenItemUrls(rows, seenKeys), ['https://a.com']);
});
