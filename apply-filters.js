/**
 * flags holds the current filter state for all filter dimensions.
 * It is restored from URL state (query param or legacy hash) when present.
 */
let flags;
const LEGACY_DEFAULT_START_DATE = '2024-08-01';
let DEFAULT_START_DATE = '';
const getTodayISODate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const DEFAULT_END_DATE = getTodayISODate();

const DEFAULT_COLUMN_VISIBILITY = {
  author: false,
  channel: false,
  language: false,
  social: true,
  contributor: false,
  category: true,
};

const createDefaultFlags = () => ({
  technologies: {},
  categories: {},
  channels: {},
  authors: {},
  contributors: {},
  languages: {},
  dateRange: { from: DEFAULT_START_DATE, to: DEFAULT_END_DATE },
});

const normalizeFlags = (input) => {
  const normalized = createDefaultFlags();
  if (!input || typeof input !== 'object') return normalized;

  ['technologies', 'categories', 'channels', 'authors', 'contributors', 'languages'].forEach((key) => {
    if (input[key] && typeof input[key] === 'object') normalized[key] = input[key];
  });

  if (input.dateRange && typeof input.dateRange === 'object') {
    const from = typeof input.dateRange.from === 'string' ? input.dateRange.from : DEFAULT_START_DATE;
    const to = typeof input.dateRange.to === 'string' ? input.dateRange.to : DEFAULT_END_DATE;
    normalized.dateRange = { from, to };
  }

  return normalized;
};

const normalizeColumnVisibility = (input) => {
  const normalized = { ...DEFAULT_COLUMN_VISIBILITY };
  if (!input || typeof input !== 'object') return normalized;

  Object.keys(DEFAULT_COLUMN_VISIBILITY).forEach((key) => {
    if (typeof input[key] === 'boolean') normalized[key] = input[key];
  });

  return normalized;
};

const normalizeActiveTab = (value) => (value === 'trends' ? 'trends' : 'table');

const decodeShareState = (encoded) => {
  if (!encoded) return null;
  try {
    const normalized = `${encoded}`
      // URLSearchParams can decode `+` as spaces.
      .replace(/\s/g, '+')
      // Accept URL-safe base64 variants as well.
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const decompressed = LZString.decompressFromBase64(normalized);
    if (!decompressed) return null;
    const parsed = JSON.parse(decompressed);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
};

const getStateFromUrl = () => {
  const url = new URL(window.location.href);
  let stateFromQuery = '';
  for (const [key, value] of url.searchParams.entries()) {
    if (key.toLowerCase() === 'state') {
      stateFromQuery = value;
      break;
    }
  }

  const queryState = decodeShareState(stateFromQuery);
  if (queryState) {
    return { source: 'query', encoded: stateFromQuery, state: queryState };
  }

  const hash = window.location.hash.slice(1);
  if (!hash) return { source: null, encoded: '', state: null };
  const hashState = decodeShareState(hash);
  if (!hashState) return { source: null, encoded: '', state: null };
  return { source: 'hash', encoded: hash, state: hashState };
};

const stateFromUrl = getStateFromUrl();
const parsedHashState = stateFromUrl.state;
const hasNestedState = parsedHashState && typeof parsedHashState === 'object' && parsedHashState.filters;

const appState = {
  filters: normalizeFlags(hasNestedState ? parsedHashState.filters : parsedHashState),
  columns: normalizeColumnVisibility(hasNestedState ? parsedHashState.columns : null),
  activeTab: normalizeActiveTab(hasNestedState ? parsedHashState.activeTab : null),
};

if (stateFromUrl.source === 'hash') {
  const cleanedUrl = new URL(window.location.href);
  cleanedUrl.hash = '';
  [...cleanedUrl.searchParams.keys()]
    .filter((key) => key.toLowerCase() === 'state')
    .forEach((key) => cleanedUrl.searchParams.delete(key));
  window.history.replaceState({}, '', cleanedUrl.toString());
}

if (stateFromUrl.source === 'query') {
  const cleanedUrl = new URL(window.location.href);
  [...cleanedUrl.searchParams.keys()]
    .filter((key) => key.toLowerCase() === 'state')
    .forEach((key) => cleanedUrl.searchParams.delete(key));
  window.history.replaceState({}, '', cleanedUrl.toString());
}

flags = appState.filters;
window.flags = flags;
const filtersSummaryEl = document.querySelector('#filters-summary');

const hasActiveRestriction = (map) => Object.values(map || {}).some((value) => value === 0);

const updateFilterSummary = (visibleRows, totalRows) => {
  if (!filtersSummaryEl) return;
  const resultWord = visibleRows === 1 ? 'result' : 'results';
  filtersSummaryEl.textContent = `${visibleRows}/${totalRows} ${resultWord}`;
};

const setItemSelected = (item, selected) => {
  item.selected = selected;
};

const syncTomSelectValue = (select) => {
  if (!select?.tomselect) return;
  const selectedValues = [...select.options]
    .filter((option) => option.selected)
    .map((option) => option.value);
  select.tomselect.setValue(selectedValues, true);
};

const enhanceWithTomSelect = (selector) => {
  const select = document.querySelector(selector);
  if (!select || typeof window.TomSelect !== 'function' || select.tomselect) return;

  const placeholder = select.dataset.placeholder || 'Any';
  const ts = new TomSelect(select, {
    plugins: ['remove_button'],
    closeAfterSelect: false,
    hideSelected: false,
    maxOptions: null,
    create: false,
    persist: false,
    placeholder,
  });

};

const loadMultiSelect = (options, id, keyword) => {
  const select = document.querySelector(id);
  if (!select) return;
  const safeOptions = Array.isArray(options) ? options : [];
  const template = document.querySelector('#templateTopicRow');
  const keywordFlags = flags[keyword] || {};
  const hasRestrictions = hasActiveRestriction(keywordFlags);

  safeOptions.forEach((value) => {
    const clone = template.content.cloneNode(true);
    const item = clone.firstElementChild;
    item.value = value;
    item.textContent = value;
    const val = keywordFlags[value];
    if (hasRestrictions && val !== 0) setItemSelected(item, true);
    select.appendChild(clone);
  });
};

const passesFilter = (map, value, splitValues = false) => {
  if (typeof window.activityUtils?.matchesSelectionMap === 'function') {
    return window.activityUtils.matchesSelectionMap(map, value, { splitValues });
  }

  const hasActiveSelections = Object.values(map || {}).some((selection) => selection === 1);
  if (!hasActiveSelections) return true;

  const candidates = splitValues
    ? `${value ?? ''}`.split(',').map((item) => `${item}`.trim()).filter(Boolean)
    : [`${value ?? ''}`.trim()].filter(Boolean);

  if (candidates.length === 0) return false;
  return candidates.some((candidate) => map[candidate] === 1);
};

const parseISODate = (value) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!m) return null;
  const date = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (
    date.getUTCFullYear() !== +m[1] ||
    date.getUTCMonth() !== (+m[2] - 1) ||
    date.getUTCDate() !== +m[3]
  ) return null;
  return date;
};

const parseRowDate = (value) => {
  if (!value) return null;
  const exactIso = parseISODate(value);
  if (exactIso) return exactIso;
  const date = new Date(value);
  if (isNaN(date)) return null;
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
};

const toISODate = (date) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getEarliestActivityDateISO = () => {
  const rows = window.activityData || [];
  let earliest = null;

  rows.forEach((row) => {
    const parsed = parseRowDate(row?.Date);
    if (!parsed) return;
    if (!earliest || parsed < earliest) earliest = parsed;
  });

  return earliest ? toISODate(earliest) : '';
};

const isDateInRange = (dateString) => {
  const rowDate = parseRowDate(dateString);
  if (!rowDate) return true;
  const fromDate = parseISODate(flags.dateRange.from);
  const toDate = parseISODate(flags.dateRange.to);
  if (fromDate && rowDate < fromDate) return false;
  if (toDate && rowDate > toDate) return false;
  return true;
};

const isRowVisible = (row) => {
  const { channels, technologies, categories, authors, contributors, languages } = flags;
  return isDateInRange(row.dataset.date) && [
    [channels, row.dataset.channels, false],
    [technologies, row.dataset.technologies, true],
    [categories, row.dataset.categories, false],
    [authors, row.dataset.authors, false],
    [contributors, row.dataset.contributors, true],
    [languages, row.dataset.languages, false],
  ].every(([map, val, splitValues]) => passesFilter(map, val, splitValues));
};

const trendsTabIsActive = () => document.querySelector('#tab-trends')?.classList.contains('active');
const isTableRenderReady = () => {
  if (!window.tableRenderGate || typeof window.tableRenderGate.isComplete !== 'function') return true;
  return window.tableRenderGate.isComplete();
};

const getActiveTab = () => (
  document.querySelector('#tab-trends-trigger')?.classList.contains('active') ? 'trends' : 'table'
);

const setActiveTab = (tabKey) => {
  const requested = normalizeActiveTab(tabKey);
  const desired = requested === 'trends' && !isTableRenderReady() ? 'table' : requested;
  const tableTrigger = document.querySelector('#tab-table-trigger');
  const trendsTrigger = document.querySelector('#tab-trends-trigger');
  const tablePane = document.querySelector('#tab-table');
  const trendsPane = document.querySelector('#tab-trends');

  const tableIsActive = desired === 'table';
  tableTrigger?.classList.toggle('active', tableIsActive);
  trendsTrigger?.classList.toggle('active', !tableIsActive);
  tableTrigger?.setAttribute('aria-selected', String(tableIsActive));
  trendsTrigger?.setAttribute('aria-selected', String(!tableIsActive));

  tablePane?.classList.toggle('show', tableIsActive);
  tablePane?.classList.toggle('active', tableIsActive);
  trendsPane?.classList.toggle('show', !tableIsActive);
  trendsPane?.classList.toggle('active', !tableIsActive);

  appState.activeTab = requested;
};

const applyFilters = () => {
  if (!isTableRenderReady()) return;
  const rows = [...document.querySelectorAll('#main-table tbody tr')];
  let visibleRows = 0;

  rows.forEach((row) => {
    const showRow = isRowVisible(row);
    if (showRow) visibleRows += 1;
    row.classList.toggle('hidden', !showRow);
  });

  updateFilterSummary(visibleRows, rows.length);

  if (trendsTabIsActive() && typeof window.renderCharts === 'function') {
    window.renderCharts();
  }
};

// Expose for use by the background-refresh logic in load-table.js
window.applyFilters = applyFilters;

const resetMultiSelect = (selector, keyword) => {
  const select = document.querySelector(selector);
  if (!select) return;

  [...select.options].forEach((option) => setItemSelected(option, false));
  syncTomSelectValue(select);
  flags[keyword] = {};
};

const updateFlags = (e, keyword) => {
  const items = [...e.currentTarget.options];
  const selectedCount = items.filter((item) => item.selected).length;

  if (selectedCount === 0) {
    // Empty selection means "all values".
    flags[keyword] = {};
  } else {
    flags[keyword] = {};
    items.forEach((item) => {
      flags[keyword][item.value] = item.selected ? 1 : 0;
    });
  }

  applyFilters();
};

window.onDataLoaded = () => {
  const dd = window.dropdownData || {};
  const earliestDate = getEarliestActivityDateISO();

  if (earliestDate) {
    DEFAULT_START_DATE = earliestDate;
    const shouldUseNewDefaultStart =
      !flags.dateRange.from || flags.dateRange.from === LEGACY_DEFAULT_START_DATE;
    if (shouldUseNewDefaultStart) {
      flags.dateRange.from = DEFAULT_START_DATE;
    }
  }

  loadMultiSelect(dd.technologies, '#topics', 'technologies');
  enhanceWithTomSelect('#topics');
  document.querySelector('#topics')?.addEventListener('change', (e) => updateFlags(e, 'technologies'));

  loadMultiSelect(dd.categories, '#category', 'categories');
  enhanceWithTomSelect('#category');
  document.querySelector('#category')?.addEventListener('change', (e) => updateFlags(e, 'categories'));

  loadMultiSelect(dd.channels, '#channel', 'channels');
  enhanceWithTomSelect('#channel');
  document.querySelector('#channel')?.addEventListener('change', (e) => updateFlags(e, 'channels'));

  loadMultiSelect(dd.authors, '#author', 'authors');
  enhanceWithTomSelect('#author');
  document.querySelector('#author')?.addEventListener('change', (e) => updateFlags(e, 'authors'));

  loadMultiSelect(dd.contributors, '#contributors', 'contributors');
  enhanceWithTomSelect('#contributors');
  document.querySelector('#contributors')?.addEventListener('change', (e) => updateFlags(e, 'contributors'));

  loadMultiSelect(dd.languages, '#language', 'languages');
  enhanceWithTomSelect('#language');
  document.querySelector('#language')?.addEventListener('change', (e) => updateFlags(e, 'languages'));

  const dateFromInput = document.querySelector('#date-from');
  const dateToInput = document.querySelector('#date-to');
  if (dateFromInput) dateFromInput.value = flags.dateRange.from;
  if (dateToInput) dateToInput.value = flags.dateRange.to;

  const handleDateRangeChange = () => {
    flags.dateRange.from = dateFromInput?.value || '';
    flags.dateRange.to = dateToInput?.value || '';
    applyFilters();
  };

  dateFromInput?.addEventListener('change', handleDateRangeChange);
  dateToInput?.addEventListener('change', handleDateRangeChange);

  initApp();
};

const initApp = () => {
  const event = new Event('change');
  ['#topics', '#category', '#channel', '#author', '#contributors', '#language'].forEach((id) => {
    document.querySelector(id)?.dispatchEvent(event);
  });
};

const TOGGLEABLE_COLS = [
  { key: 'author', filterId: '#filter-author' },
  { key: 'channel', filterId: '#filter-channel' },
  { key: 'language', filterId: '#filter-language' },
  { key: 'social' },
  { key: 'contributor', filterId: '#filter-contributors' },
  { key: 'category', filterId: '#filter-category' },
];

const colPickerBtn = document.querySelector('#col-picker-btn');
const colPickerPanel = document.querySelector('#col-picker-panel');

colPickerBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  colPickerPanel?.classList.toggle('open');
});

document.addEventListener('click', () => colPickerPanel?.classList.remove('open'));

const applyColumnToggleState = ({ key, filterId }, checked) => {
  document.querySelectorAll(`[data-col="${key}"]`).forEach((el) => {
    el.classList.toggle('hidden', !checked);
  });

  if (filterId) {
    const filterEl = document.querySelector(filterId);
    if (filterEl) filterEl.style.display = checked ? '' : 'none';
  }
};

TOGGLEABLE_COLS.forEach((col) => {
  const cb = document.querySelector(`#col-toggle-${col.key}`);
  if (!cb) return;
  cb.checked = appState.columns[col.key];

  cb.addEventListener('change', () => {
    appState.columns[col.key] = cb.checked;
    applyColumnToggleState(col, cb.checked);
  });
});

const syncColumnVisibilityWithToggles = () => {
  TOGGLEABLE_COLS.forEach((col) => {
    const cb = document.querySelector(`#col-toggle-${col.key}`);
    if (!cb) return;
    applyColumnToggleState(col, cb.checked);
  });
};

window.syncColumnVisibilityWithToggles = syncColumnVisibilityWithToggles;

syncColumnVisibilityWithToggles();

const resetFiltersBtn = document.querySelector('#reset-filters-btn');
resetFiltersBtn?.addEventListener('click', () => {
  resetMultiSelect('#topics', 'technologies');
  resetMultiSelect('#category', 'categories');
  resetMultiSelect('#channel', 'channels');
  resetMultiSelect('#author', 'authors');
  resetMultiSelect('#contributors', 'contributors');
  resetMultiSelect('#language', 'languages');

  flags.dateRange = { from: DEFAULT_START_DATE, to: DEFAULT_END_DATE };
  const dateFromInput = document.querySelector('#date-from');
  const dateToInput = document.querySelector('#date-to');
  if (dateFromInput) dateFromInput.value = DEFAULT_START_DATE;
  if (dateToInput) dateToInput.value = DEFAULT_END_DATE;

  TOGGLEABLE_COLS.forEach((col) => {
    const cb = document.querySelector(`#col-toggle-${col.key}`);
    if (!cb) return;
    cb.checked = DEFAULT_COLUMN_VISIBILITY[col.key];
    appState.columns[col.key] = cb.checked;
    applyColumnToggleState(col, cb.checked);
  });

  applyFilters();
});

const previousOnDataLoaded = window.onDataLoaded;
window.onDataLoaded = () => {
  if (typeof previousOnDataLoaded === 'function') previousOnDataLoaded();
  syncColumnVisibilityWithToggles();
};

document.querySelector('#tab-table-trigger')?.addEventListener('click', () => {
  setActiveTab('table');
});

document.querySelector('#tab-trends-trigger')?.addEventListener('click', () => {
  setActiveTab('trends');
  if (!isTableRenderReady()) return;
  if (typeof window.renderCharts === 'function') window.renderCharts();
});

const getSerializableShareState = () => ({
  filters: flags,
  columns: TOGGLEABLE_COLS.reduce((acc, col) => {
    const cb = document.querySelector(`#col-toggle-${col.key}`);
    acc[col.key] = cb ? !!cb.checked : !!appState.columns[col.key];
    return acc;
  }, {}),
  activeTab: getActiveTab(),
});

const buildShareUrl = (encodedState) => {
  const url = new URL(window.location.href);
  url.hash = '';
  url.searchParams.set('state', encodedState);
  return url.toString();
};

const copyTextToClipboard = async (text) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const helper = document.createElement('textarea');
  helper.value = text;
  helper.setAttribute('readonly', '');
  helper.style.position = 'absolute';
  helper.style.left = '-9999px';
  document.body.appendChild(helper);
  helper.select();
  document.execCommand('copy');
  document.body.removeChild(helper);
};

const setShareFeedback = (message, isError = false) => {
  const feedback = document.querySelector('#share-view-feedback');
  if (!feedback) return;
  feedback.textContent = message;
  feedback.classList.toggle('is-error', isError);
};

const shareViewBtn = document.querySelector('#share-view-btn');
shareViewBtn?.addEventListener('click', async () => {
  const encoded = LZString.compressToBase64(JSON.stringify(getSerializableShareState()));
  const shareUrl = buildShareUrl(encoded);

  try {
    await copyTextToClipboard(shareUrl);
    setShareFeedback('Shareable link copied to clipboard.');
  } catch {
    setShareFeedback('Unable to copy link. Please try again.', true);
  }
});

setActiveTab(appState.activeTab);

if (window.tableRenderGate && typeof window.tableRenderGate.onComplete === 'function') {
  window.tableRenderGate.onComplete(() => {
    setActiveTab(appState.activeTab);
    if (trendsTabIsActive() && typeof window.renderCharts === 'function') {
      window.renderCharts();
    }
  });
}
