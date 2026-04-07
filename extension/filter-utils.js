/**
 * filter-utils.js — Pure filtering logic for the extension background service worker.
 *
 * Mirrors the relevant subset of activity-utils.js so the extension is self-contained
 * (a packaged extension cannot reference files outside its own folder).
 *
 * All functions are stateless and dependency-free so they can be unit-tested directly.
 */

const INVISIBLE_CHARS_RE = /[\u200B-\u200D\u2060\uFEFF]/g;

/** Strip invisible chars, non-breaking spaces, and trim. */
export const normalizeCell = (value) =>
  `${value ?? ''}`.replace(/\u00A0/g, ' ').replace(INVISIBLE_CHARS_RE, '').trim();

/** Return the first non-empty value found for any of the given field-name aliases. */
export const pickFirst = (row, keys) => {
  for (const key of keys) {
    const v = normalizeCell(row?.[key]);
    if (v) return v;
  }
  return '';
};

/**
 * Parse a date string (ISO YYYY-MM-DD or M/D/YYYY) to a local-midnight Date.
 * Returns null if the value cannot be parsed.
 */
export const parseDateToLocalDay = (value) => {
  const raw = normalizeCell(value);
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const [, y, m, d] = iso.map(Number);
    const parsed = new Date(y, m - 1, d);
    if (parsed.getFullYear() !== y || parsed.getMonth() !== m - 1 || parsed.getDate() !== d) return null;
    return parsed;
  }

  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const [, m, d, y] = slash.map(Number);
    return new Date(y, m - 1, d);
  }

  const fallback = new Date(raw);
  if (Number.isNaN(fallback.getTime())) return null;
  return new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate());
};

/** Format a local Date as YYYY-MM-DD. */
export const toISODateString = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/**
 * Convert a filter array to a selection map.
 * ['GIS', 'Python'] → { GIS: 1, Python: 1 }
 */
export const toSelectionMap = (arr) =>
  Object.fromEntries((arr ?? []).map((v) => [v, 1]));

/**
 * Check whether a row field value satisfies a selection map.
 * An empty map (no active selections) always passes.
 * splitValues: true for comma-separated multi-value fields (technologies, contributors).
 */
export const matchesSelectionMap = (map, value, { splitValues = false } = {}) => {
  const hasActive = Object.values(map ?? {}).some((v) => v === 1);
  if (!hasActive) return true;

  const raw = `${value ?? ''}`;
  const candidates = splitValues
    ? raw.split(',').map((s) => normalizeCell(s)).filter(Boolean)
    : [normalizeCell(raw)].filter(Boolean);

  if (candidates.length === 0) return false;
  return candidates.some((c) => map[c] === 1);
};

// Field aliases — mirrors OPEN_SHEET_SCHEMA in activity-utils.js.
const ALIASES = {
  date:        ['Date'],
  title:       ['Title', 'Content title'],
  url:         ['URL', 'Url', 'Link'],
  technology:  ['Topics_Product', 'Technology', 'Technologies'],
  category:    ['Category', 'Category / Content type', 'Content type'],
  channel:     ['Channel'],
  author:      ['Author', 'Authors'],
  contributor: ['Contributors', 'Contributor', 'Authors'],
  language:    ['Language', 'Languages'],
};

/**
 * Return true if the row has a meaningful title and a non-placeholder URL.
 * Rows without both are skipped (same rule as sanitizeActivityRows in activity-utils.js).
 */
export const isCountableRow = (row) => {
  const title = pickFirst(row, ALIASES.title);
  const url = normalizeCell(pickFirst(row, ALIASES.url));
  if (!title || !url) return false;
  // Treat 'n/a', 'na', etc. as absent
  const urlLower = url.toLowerCase();
  return !['n/a', 'na', 'none', '-', '--', 'tbd'].includes(urlLower);
};

/**
 * Return true if the row's date is strictly after lastSeenPublishedAt (ISO YYYY-MM-DD).
 * When lastSeenPublishedAt is null (first run before initialization), all rows are new.
 */
export const isItemNew = (row, lastSeenPublishedAt) => {
  if (!lastSeenPublishedAt) return true;
  const rowDate = parseDateToLocalDay(pickFirst(row, ALIASES.date));
  if (!rowDate) return false;
  const lastSeen = parseDateToLocalDay(lastSeenPublishedAt);
  if (!lastSeen) return true;
  return rowDate > lastSeen;
};

/**
 * Return true if the row matches ALL configured filters.
 * An empty array for any filter dimension means "no restriction" (all values pass).
 *
 * Filter dimensions and their split behaviour:
 *   technologies  → multi-value (comma-separated in sheet)  splitValues: true
 *   categories    → single-value                             splitValues: false
 *   channels      → single-value                             splitValues: false
 *   authors       → single-value                             splitValues: false
 *   contributors  → multi-value (comma-separated in sheet)  splitValues: true
 *   languages     → single-value                             splitValues: false
 */
export const itemMatchesFilters = (row, filters = {}) => {
  const checks = [
    [filters.technologies, pickFirst(row, ALIASES.technology),  true],
    [filters.categories,   pickFirst(row, ALIASES.category),    false],
    [filters.channels,     pickFirst(row, ALIASES.channel),     false],
    [filters.authors,      pickFirst(row, ALIASES.author),      false],
    [filters.contributors, pickFirst(row, ALIASES.contributor), true],
    [filters.languages,    pickFirst(row, ALIASES.language),    false],
  ];
  return checks.every(([arr, value, splitValues]) =>
    matchesSelectionMap(toSelectionMap(arr), value, { splitValues })
  );
};

/**
 * Count rows that are both new (date > lastSeenPublishedAt) and match all filters.
 * This is the core badge number calculation.
 */
export const countNewItems = (rows, { filters = {}, lastSeenPublishedAt = null } = {}) =>
  rows.filter(
    (row) => isCountableRow(row) && isItemNew(row, lastSeenPublishedAt) && itemMatchesFilters(row, filters)
  ).length;

/**
 * Find the ISO date string of the most recent item in a dataset.
 * Used on first install to initialise lastSeenPublishedAt.
 */
export const findLatestDate = (rows) => {
  let latest = null;
  for (const row of rows) {
    const d = parseDateToLocalDay(pickFirst(row, ALIASES.date));
    if (d && (!latest || d > latest)) latest = d;
  }
  return latest ? toISODateString(latest) : null;
};

// ── Web-app URL building (for "Open feed" in popup.js) ────────────────────────

/**
 * Convert an extension filter-array to the web app's flags object format.
 * Extension stores:  { technologies: ['ArcGIS Online'] }
 * Web app expects:   { technologies: { 'ArcGIS Online': 1 } }
 */
export const toWebAppFlagsObj = (arr) =>
  Object.fromEntries((arr ?? []).map((v) => [v, 1]));

/**
 * Return true when all filter arrays are empty (no restrictions configured).
 */
export const hasNoFilters = (filters) =>
  Object.values(filters ?? {}).every((arr) => !Array.isArray(arr) || arr.length === 0);

/**
 * Build the state object that the web app's ?state= param expects.
 * Mirrors the format produced by getSerializableShareState() in apply-filters.js.
 */
export const buildWebAppState = (filters) => ({
  filters: {
    technologies: toWebAppFlagsObj(filters?.technologies),
    categories:   toWebAppFlagsObj(filters?.categories),
    channels:     toWebAppFlagsObj(filters?.channels),
    authors:      toWebAppFlagsObj(filters?.authors),
    contributors: toWebAppFlagsObj(filters?.contributors),
    languages:    toWebAppFlagsObj(filters?.languages),
    dateRange:    { from: '', to: '' },
    datePreset:   'showAll',
    featuredOnly: false,
  },
  columns: {},
  activeTab: 'table',
});

// ── Key-set tracking (detects new items regardless of date) ───────────────────

/**
 * Stable unique key for a row: the normalized URL (lowercased).
 * Used to track which items the user has already seen so that items added
 * retroactively (with an old date) are still detected as new.
 */
export const itemKey = (row) => {
  const url = normalizeCell(pickFirst(row, ALIASES.url));
  if (!url || ['n/a', 'na', 'none', '-', '--', 'tbd'].includes(url.toLowerCase())) return '';
  return url.toLowerCase();
};

/**
 * Collect the item keys of all countable rows as an array.
 * Arrays are JSON-serialisable and can be stored directly in chrome.storage.
 */
export const collectItemKeys = (rows) => {
  const keys = [];
  for (const row of rows) {
    if (isCountableRow(row)) {
      const key = itemKey(row);
      if (key) keys.push(key);
    }
  }
  return keys;
};

/**
 * Collect the item keys of all countable unseen rows that also match filters.
 * Used to build the ?newItems= URL param for the "Open feed" button so the
 * web app can render "New" badges on exactly these rows.
 */
export const collectUnseenItemUrls = (rows, seenKeys, filters = {}) => {
  const urls = [];
  for (const row of rows) {
    if (!isCountableRow(row) || !isItemUnseen(row, seenKeys) || !itemMatchesFilters(row, filters)) continue;
    const key = itemKey(row); // already lowercased
    if (key) urls.push(key);
  }
  return urls;
};

/**
 * Return true if the row's key is absent from the seenKeys Set.
 * When seenKeys is null or empty (first run before any "mark as seen"),
 * all items are considered unseen.
 */
export const isItemUnseen = (row, seenKeys) => {
  if (!seenKeys || seenKeys.size === 0) return true;
  const key = itemKey(row);
  return key ? !seenKeys.has(key) : false;
};

/**
 * Count rows that are unseen (key not in seenKeys) and match all filters.
 * Preferred over countNewItems() because it detects retroactively-added rows
 * whose date precedes lastSeenPublishedAt.
 */
export const countNewItemsByKey = (rows, seenKeys, filters = {}) =>
  rows.filter(
    (row) => isCountableRow(row) && isItemUnseen(row, seenKeys) && itemMatchesFilters(row, filters)
  ).length;

/**
 * Find the ISO date string of the earliest unseen item that matches filters.
 * Used to build the "from" date in the "Open feed" URL so the web app
 * pre-filters to the range that contains the new items.
 * Returns null when there are no unseen items.
 */
export const findEarliestUnseenDate = (rows, seenKeys, filters = {}) => {
  let earliest = null;
  for (const row of rows) {
    if (!isCountableRow(row) || !isItemUnseen(row, seenKeys) || !itemMatchesFilters(row, filters)) continue;
    const d = parseDateToLocalDay(pickFirst(row, ALIASES.date));
    if (d && (!earliest || d < earliest)) earliest = d;
  }
  return earliest ? toISODateString(earliest) : null;
};
