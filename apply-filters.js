/**
 * flags holds the current filter state for all filter dimensions.
 * It is restored from URL state (query param or legacy hash) when present.
 */
let flags;
const DATE_PRESET_CUSTOM = 'custom';
const DATE_PRESET_SHOW_ALL = 'showAll';
const DATE_PRESET_LAST_60 = 'last60';
const DATE_PRESET_DEFAULT = DATE_PRESET_SHOW_ALL;
const DATE_PRESETS = new Set([
  DATE_PRESET_SHOW_ALL,
  'last30',
  DATE_PRESET_LAST_60,
  'last90',
  'thisMonth',
  'thisQuarter',
  'lastQuarter',
  'thisYear',
  'pastYear',
  DATE_PRESET_CUSTOM,
]);

const DEFAULT_COLUMN_VISIBILITY = {
  topic: false,
  author: false,
  channel: false,
  language: false,
  social: true,
  contributor: false,
  category: false,
};

const TABLE_LAYOUT_STORAGE_KEY = 'esridevs_table_layout_v1';
const ALL_TABLE_COLS = [
  { key: 'date', label: 'Date', fixedVisibility: true },
  { key: 'title', label: 'Content title', fixedVisibility: true },
  { key: 'author', label: 'Publisher', filterId: '#filter-author' },
  { key: 'channel', label: 'Channel owner', filterId: '#filter-channel' },
  { key: 'language', label: 'Language', filterId: '#filter-language' },
  { key: 'social', label: 'Share' },
  { key: 'contributor', label: 'People involved', filterId: '#filter-contributors' },
  { key: 'topic', label: 'Topic', filterId: '#filter-topics' },
  { key: 'category', label: 'Content type', filterId: '#filter-category' },
];
const DEFAULT_COLUMN_ORDER = ALL_TABLE_COLS.map((col) => col.key);
const TABLE_COL_KEY_SET = new Set(DEFAULT_COLUMN_ORDER);
const COLUMN_RESIZE_LIMITS = {
  date: { min: 72, max: 180 },
  title: { min: 160, max: 720 },
  author: { min: 92, max: 320 },
  channel: { min: 96, max: 340 },
  language: { min: 80, max: 220 },
  social: { min: 92, max: 180 },
  contributor: { min: 96, max: 340 },
  topic: { min: 96, max: 360 },
  category: { min: 88, max: 240 },
};
const AUTO_COLUMN_PREFERRED_WIDTHS = {
  date: 92,
  title: 250,
  author: 120,
  channel: 126,
  language: 92,
  social: 108,
  contributor: 126,
  topic: 132,
  category: 108,
};

const createDefaultFlags = () => ({
  technologies: {},
  categories: {},
  channels: {},
  authors: {},
  contributors: {},
  languages: {},
  featuredOnly: false,
  datePreset: DATE_PRESET_DEFAULT,
  dateRange: { from: '', to: '' },
});

const normalizeDatePreset = (value, fallback = DATE_PRESET_DEFAULT) => (
  typeof value === 'string' && DATE_PRESETS.has(value) ? value : fallback
);

const normalizeFlags = (input) => {
  const normalized = createDefaultFlags();
  if (!input || typeof input !== 'object') return normalized;

  ['technologies', 'categories', 'channels', 'authors', 'contributors', 'languages'].forEach((key) => {
    if (input[key] && typeof input[key] === 'object') normalized[key] = input[key];
  });
  if (typeof input.featuredOnly === 'boolean') {
    normalized.featuredOnly = input.featuredOnly;
  }

  if (Object.prototype.hasOwnProperty.call(input, 'datePreset')) {
    normalized.datePreset = normalizeDatePreset(input.datePreset, DATE_PRESET_CUSTOM);
  }

  if (input.dateRange && typeof input.dateRange === 'object') {
    const from = typeof input.dateRange.from === 'string' ? input.dateRange.from : '';
    const to = typeof input.dateRange.to === 'string' ? input.dateRange.to : '';
    normalized.dateRange = { from, to };
    if (!Object.prototype.hasOwnProperty.call(input, 'datePreset')) {
      normalized.datePreset = DATE_PRESET_CUSTOM;
    }
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

const normalizeColumnOrder = (input) => {
  if (!Array.isArray(input)) return [...DEFAULT_COLUMN_ORDER];

  const nextOrder = input
    .map((value) => `${value ?? ''}`.trim())
    .filter((value, index, values) => TABLE_COL_KEY_SET.has(value) && values.indexOf(value) === index);

  DEFAULT_COLUMN_ORDER.forEach((key) => {
    if (!nextOrder.includes(key)) nextOrder.push(key);
  });

  return nextOrder;
};

const normalizeColumnWidths = (input) => {
  const normalized = {};
  if (!input || typeof input !== 'object') return normalized;

  Object.entries(input).forEach(([key, rawWidth]) => {
    if (!TABLE_COL_KEY_SET.has(key)) return;
    const width = Number(rawWidth);
    if (!Number.isFinite(width)) return;
    const limits = COLUMN_RESIZE_LIMITS[key] || { min: 72, max: 960 };
    normalized[key] = Math.round(Math.min(limits.max, Math.max(limits.min, width)));
  });

  return normalized;
};

const loadLocalTableLayout = () => {
  try {
    const raw = localStorage.getItem(TABLE_LAYOUT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
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
const activeTabFromState = hasNestedState
  ? parsedHashState.activeTab
  : (parsedHashState && typeof parsedHashState === 'object' ? parsedHashState.activeTab : null);
const localTableLayout = loadLocalTableLayout();
const shareColumns = normalizeColumnVisibility(hasNestedState ? parsedHashState.columns : null);
const initialColumns = stateFromUrl.source
  ? shareColumns
  : normalizeColumnVisibility(localTableLayout?.columns);

const appState = {
  filters: normalizeFlags(hasNestedState ? parsedHashState.filters : parsedHashState),
  columns: initialColumns,
  columnOrder: normalizeColumnOrder(localTableLayout?.order),
  columnWidths: normalizeColumnWidths(localTableLayout?.widths),
  activeTab: normalizeActiveTab(activeTabFromState),
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
const filterPopoverEl = document.querySelector('#filter-popover');
const filterPopoverContentEl = document.querySelector('#filter-popover-content');
const filterPopoverTitleEl = document.querySelector('#filter-popover-title');
const filterPopoverDescriptionEl = document.querySelector('#filter-popover-description');
const filterPopoverCloseBtn = document.querySelector('#filter-popover-close');
let activeFilterTargetKey = '';
let activeFilterTriggerEl = null;
let suppressFilterPopoverCloseUntil = 0;

const FILTER_TARGETS = {
  topics: {
    slotSelector: '#filter-slot-topics',
    wrapperSelector: '#filter-topics',
    controlSelector: '#topics',
    title: 'Topic',
    description: 'Restrict results to one or more technologies or topics.',
  },
  category: {
    slotSelector: '#filter-slot-category',
    wrapperSelector: '#filter-category',
    controlSelector: '#category',
    title: 'Content type',
    description: 'Focus the table on one or more content formats.',
  },
  channel: {
    slotSelector: '#filter-slot-channel',
    wrapperSelector: '#filter-channel',
    controlSelector: '#channel',
    title: 'Channel owner',
    description: 'Who owns or administers the channel, site, or account where the piece appears.',
  },
  author: {
    slotSelector: '#filter-slot-author',
    wrapperSelector: '#filter-author',
    controlSelector: '#author',
    title: 'Publisher',
    description: 'Who publishes, issues, or officially stands behind the piece in this resource.',
  },
  contributors: {
    slotSelector: '#filter-slot-contributors',
    wrapperSelector: '#filter-contributors',
    controlSelector: '#contributors',
    title: 'People involved',
    description: 'People who had relevant involvement in creating, publishing, or distributing this piece.',
  },
  language: {
    slotSelector: '#filter-slot-language',
    wrapperSelector: '#filter-language',
    controlSelector: '#language',
    title: 'Language',
    description: 'Limit results to one or more content languages.',
  },
  'date-range': {
    slotSelector: '#filter-slot-date-range',
    wrapperSelector: '#date-range-filter',
    controlSelector: '#date-preset',
    title: 'Date range',
    description: 'Pick a preset or a custom inclusive date range.',
  },
};

const FILTER_CONTROL_SELECTORS = {
  technologies: '#topics',
  categories: '#category',
  channels: '#channel',
  authors: '#author',
  contributors: '#contributors',
  languages: '#language',
};

const FILTER_TARGET_KEY_BY_KEYWORD = {
  technologies: 'topics',
  categories: 'category',
  channels: 'channel',
  authors: 'author',
  contributors: 'contributors',
  languages: 'language',
};
const FILTER_REOPEN_DELAY_MS = 180;

const FILTER_CHIP_GROUPS = [
  { key: 'technologies', label: 'Topic' },
  { key: 'categories', label: 'Content type' },
  { key: 'channels', label: 'Channel owner' },
  { key: 'authors', label: 'Publisher' },
  { key: 'contributors', label: 'People involved' },
  { key: 'languages', label: 'Language' },
];

const DATE_PRESET_LABELS = {
  showAll: 'Show all',
  last30: 'Last 30 days',
  last60: 'Last 60 days',
  last90: 'Last 90 days',
  thisMonth: 'This month',
  thisQuarter: 'This quarter',
  lastQuarter: 'Last quarter',
  thisYear: 'This year',
  pastYear: 'Past year',
  custom: 'Custom range',
};

const getFilterTriggerButtons = (targetKey) => (
  [...document.querySelectorAll(`[data-filter-target="${targetKey}"]`)]
);

const getActiveFilterControl = () => {
  const activeConfig = FILTER_TARGETS[activeFilterTargetKey];
  return activeConfig ? document.querySelector(activeConfig.controlSelector) : null;
};

const isActiveTomSelectTarget = (target) => {
  if (!(target instanceof Element)) return false;
  // Check by CSS class first so clicks inside any TomSelect dropdown (which may be
  // rendered outside the popover in the DOM) are always recognized as internal.
  if (target.closest('.ts-dropdown') || target.closest('.ts-wrapper')) return true;
  const activeControl = getActiveFilterControl();
  const tomselect = activeControl?.tomselect;
  if (!tomselect) return false;
  return !!(
    tomselect.wrapper?.contains(target)
    || tomselect.control?.contains(target)
    || tomselect.dropdown?.contains(target)
  );
};

const isActiveTomSelectOpen = () => !!getActiveFilterControl()?.tomselect?.isOpen;
const shouldSuppressFilterPopoverClose = () => Date.now() < suppressFilterPopoverCloseUntil;

const restoreFilterTarget = (targetKey) => {
  const config = FILTER_TARGETS[targetKey];
  if (!config) return;
  const wrapper = document.querySelector(config.wrapperSelector);
  const slot = document.querySelector(config.slotSelector);
  if (!wrapper || !slot || wrapper.parentElement === slot) return;
  slot.appendChild(wrapper);
};

const positionFilterPopover = (triggerEl = activeFilterTriggerEl) => {
  if (!filterPopoverEl || !triggerEl || filterPopoverEl.hidden) return;

  const viewportPadding = 12;
  const desiredWidth = Math.min(420, window.innerWidth - (viewportPadding * 2));
  filterPopoverEl.style.width = `${Math.max(280, desiredWidth)}px`;

  const triggerRect = triggerEl.getBoundingClientRect();
  const popoverRect = filterPopoverEl.getBoundingClientRect();

  let left = Math.min(
    Math.max(viewportPadding, triggerRect.right - popoverRect.width),
    window.innerWidth - popoverRect.width - viewportPadding,
  );
  let top = triggerRect.bottom + 10;

  if (top + popoverRect.height > window.innerHeight - viewportPadding) {
    top = Math.max(viewportPadding, triggerRect.top - popoverRect.height - 10);
  }

  filterPopoverEl.style.left = `${left}px`;
  filterPopoverEl.style.top = `${top}px`;
};

const closeFilterPopover = ({ restoreFocus = false } = {}) => {
  if (activeFilterTargetKey) {
    const activeControl = getActiveFilterControl();
    activeControl?.tomselect?.close();
  }

  if (activeFilterTargetKey) {
    restoreFilterTarget(activeFilterTargetKey);
  }

  const focusTarget = restoreFocus ? activeFilterTriggerEl : null;

  if (filterPopoverEl) {
    filterPopoverEl.hidden = true;
    filterPopoverEl.setAttribute('aria-hidden', 'true');
  }
  if (filterPopoverContentEl) {
    filterPopoverContentEl.textContent = '';
  }

  if (activeFilterTargetKey) {
    getFilterTriggerButtons(activeFilterTargetKey).forEach((buttonEl) => {
      buttonEl.setAttribute('aria-expanded', 'false');
      buttonEl.classList.remove('is-filter-open');
    });
  }

  activeFilterTargetKey = '';
  activeFilterTriggerEl = null;
  if (focusTarget) focusTarget.focus();
};

const openFilterPopover = (targetKey, triggerEl) => {
  const config = FILTER_TARGETS[targetKey];
  if (!config || !filterPopoverEl || !filterPopoverContentEl || !triggerEl) return;

  if (activeFilterTargetKey === targetKey && !filterPopoverEl.hidden) {
    closeFilterPopover({ restoreFocus: false });
    return;
  }

  closeFilterPopover();

  const wrapper = document.querySelector(config.wrapperSelector);
  const control = document.querySelector(config.controlSelector);
  if (!wrapper || !control) return;

  activeFilterTargetKey = targetKey;
  activeFilterTriggerEl = triggerEl;

  filterPopoverTitleEl.textContent = config.title;
  if (config.description) {
    filterPopoverDescriptionEl.textContent = config.description;
    filterPopoverDescriptionEl.hidden = false;
  } else {
    filterPopoverDescriptionEl.textContent = '';
    filterPopoverDescriptionEl.hidden = true;
  }

  filterPopoverContentEl.appendChild(wrapper);
  filterPopoverEl.hidden = false;
  filterPopoverEl.setAttribute('aria-hidden', 'false');
  getFilterTriggerButtons(targetKey).forEach((buttonEl) => {
    buttonEl.setAttribute('aria-expanded', 'true');
    buttonEl.classList.add('is-filter-open');
  });
  positionFilterPopover(triggerEl);

  window.requestAnimationFrame(() => {
    positionFilterPopover(triggerEl);
    if (control.tomselect) {
      control.tomselect.focus();
      control.tomselect.open();
      return;
    }
    control.focus();
  });
};

document.querySelectorAll('[data-filter-target]').forEach((buttonEl) => {
  buttonEl.setAttribute('aria-expanded', 'false');
  buttonEl.addEventListener('click', (event) => {
    event.preventDefault();
    openFilterPopover(buttonEl.getAttribute('data-filter-target'), buttonEl);
  });
});

filterPopoverCloseBtn?.addEventListener('click', () => {
  closeFilterPopover({ restoreFocus: true });
});

document.addEventListener('mousedown', (event) => {
  if (!activeFilterTargetKey || filterPopoverEl?.hidden) return;
  if (shouldSuppressFilterPopoverClose()) return;
  const target = event.target;
  if (filterPopoverEl?.contains(target)) return;
  if (activeFilterTriggerEl?.contains(target)) return;
  if (isActiveTomSelectTarget(target)) return;
  closeFilterPopover();
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || filterPopoverEl?.hidden) return;
  closeFilterPopover({ restoreFocus: true });
});


window.addEventListener('resize', () => {
  closeFilterPopover();
});

window.addEventListener('scroll', () => {
  closeFilterPopover();
}, true);

const hasActiveRestriction = (map) => Object.values(map || {}).some((value) => value === 0 || value === 1);

const getSelectedFilterValues = (map) => (
  Object.entries(map || {})
    .filter(([, value]) => value === 1)
    .map(([label]) => label)
);

const getDateChipValueLabel = () => {
  if (flags.datePreset === DATE_PRESET_SHOW_ALL && !flags.dateRange.from && !flags.dateRange.to) {
    return '';
  }

  if (flags.datePreset !== DATE_PRESET_CUSTOM) {
    return DATE_PRESET_LABELS[flags.datePreset] || DATE_PRESET_LABELS.custom;
  }

  const from = flags.dateRange.from || 'Any start';
  const to = flags.dateRange.to || 'Any end';
  return `${from} to ${to}`;
};

const getActiveFilterChips = () => {
  const chips = FILTER_CHIP_GROUPS.flatMap(({ key, label }) => (
    getSelectedFilterValues(flags[key]).map((value) => ({
      key,
      label,
      value,
    }))
  ));

  const dateValue = getDateChipValueLabel();
  if (dateValue) {
    chips.push({
      key: 'date',
      label: 'Date',
      value: dateValue,
    });
  }

  if (flags.featuredOnly) {
    chips.push({
      key: 'featuredOnly',
      label: 'Featured',
      value: 'Only featured',
    });
  }

  return chips;
};

const createFilterChipButton = ({ key, label, value }) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'table-filter-chip';
  button.dataset.filterChip = key;
  button.dataset.filterValue = value;
  button.setAttribute('aria-label', `Remove filter ${label}: ${value}`);

  const text = document.createElement('span');
  text.className = 'table-filter-chip__text';
  text.textContent = `${label}: ${value}`;
  button.appendChild(text);

  const icon = document.createElement('span');
  icon.className = 'table-filter-chip__remove';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '×';
  button.appendChild(icon);

  return button;
};

const syncFilterTriggerStates = () => {
  const activeStateByTarget = {
    topics: hasActiveRestriction(flags.technologies),
    category: hasActiveRestriction(flags.categories),
    channel: hasActiveRestriction(flags.channels),
    author: hasActiveRestriction(flags.authors),
    contributors: hasActiveRestriction(flags.contributors),
    language: hasActiveRestriction(flags.languages),
    'date-range': flags.datePreset !== DATE_PRESET_SHOW_ALL
      || !!flags.dateRange.from
      || !!flags.dateRange.to,
  };

  Object.entries(activeStateByTarget).forEach(([targetKey, isActive]) => {
    getFilterTriggerButtons(targetKey).forEach((buttonEl) => {
      buttonEl.classList.toggle('is-filter-applied', isActive);
    });
  });
};

const updateFilterSummary = (visibleRows, totalRows) => {
  if (!filtersSummaryEl) return;
  const resultWord = visibleRows === 1 ? 'result' : 'results';
  const chips = getActiveFilterChips();
  filtersSummaryEl.replaceChildren();

  const count = document.createElement('span');
  count.className = 'table-results-summary__count';
  count.textContent = `${visibleRows}/${totalRows} ${resultWord}`;
  filtersSummaryEl.appendChild(count);

  if (chips.length === 0) return;

  const chipList = document.createElement('div');
  chipList.className = 'table-results-summary__chips';
  chipList.setAttribute('aria-label', 'Applied filters');

  chips.forEach((chip) => {
    chipList.appendChild(createFilterChipButton(chip));
  });

  filtersSummaryEl.appendChild(chipList);
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

const syncFlagsFromSelect = (selector, keyword) => {
  const select = document.querySelector(selector);
  if (!select) {
    flags[keyword] = {};
    return;
  }

  const items = [...select.options];
  const selectedCount = items.filter((item) => item.selected).length;

  if (selectedCount === 0) {
    flags[keyword] = {};
    return;
  }

  flags[keyword] = {};
  items.forEach((item) => {
    flags[keyword][item.value] = item.selected ? 1 : 0;
  });
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
    onItemAdd() {
      suppressFilterPopoverCloseUntil = Date.now() + 600;
      this.setTextboxValue('');
      this.refreshOptions(false);
      window.setTimeout(() => {
        if (filterPopoverEl?.hidden) return;
        this.focus();
        this.open();
      }, 0);
    },
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
    if (hasRestrictions && val === 1) setItemSelected(item, true);
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

const getDateInputs = () => ({
  preset: document.querySelector('#date-preset'),
  from: document.querySelector('#date-from'),
  to: document.querySelector('#date-to'),
  customWrap: document.querySelector('#date-range-custom-inputs'),
});

const getLatestActivityDate = () => {
  if (typeof window.activityUtils?.getLatestActivityDate === 'function') {
    return window.activityUtils.getLatestActivityDate(window.activityData || []);
  }
  return null;
};

const getDateRangeForPreset = (preset, latestDate) => {
  if (typeof window.activityUtils?.getDateRangeForPreset === 'function') {
    return window.activityUtils.getDateRangeForPreset(preset, latestDate);
  }
  return null;
};

const syncDateInputValues = () => {
  const dateInputs = getDateInputs();
  if (dateInputs.from) dateInputs.from.value = flags.dateRange.from || '';
  if (dateInputs.to) dateInputs.to.value = flags.dateRange.to || '';
};

const syncDatePresetUi = () => {
  const dateInputs = getDateInputs();
  const isCustom = flags.datePreset === DATE_PRESET_CUSTOM;
  if (dateInputs.preset) dateInputs.preset.value = normalizeDatePreset(flags.datePreset, DATE_PRESET_CUSTOM);
  if (dateInputs.customWrap) dateInputs.customWrap.classList.toggle('hidden', !isCustom);
  if (dateInputs.from) dateInputs.from.disabled = !isCustom;
  if (dateInputs.to) dateInputs.to.disabled = !isCustom;
};

const applyDatePreset = (preset, { reapplyFilters = true } = {}) => {
  const normalizedPreset = normalizeDatePreset(preset, DATE_PRESET_CUSTOM);
  flags.datePreset = normalizedPreset;

  if (normalizedPreset === DATE_PRESET_CUSTOM) {
    syncDatePresetUi();
    syncDateInputValues();
    syncFilterTriggerStates();
    if (reapplyFilters) applyFilters();
    return;
  }

  const latestDate = getLatestActivityDate();
  const nextDateRange = getDateRangeForPreset(normalizedPreset, latestDate);

  if (!nextDateRange) {
    flags.datePreset = DATE_PRESET_CUSTOM;
    flags.dateRange = { from: '', to: '' };
    syncDatePresetUi();
    syncDateInputValues();
    syncFilterTriggerStates();
    if (reapplyFilters) applyFilters();
    return;
  }

  flags.dateRange = nextDateRange;
  syncDatePresetUi();
  syncDateInputValues();
  syncFilterTriggerStates();
  if (reapplyFilters) applyFilters();
};

const handleActivityDataRefresh = () => {
  if (flags.datePreset === DATE_PRESET_CUSTOM) return;
  applyDatePreset(flags.datePreset, { reapplyFilters: false });
};

window.handleActivityDataRefresh = handleActivityDataRefresh;

const isDateInRange = (dateString) => {
  const rowDate = parseISODate(dateString) || (dateString ? new Date(dateString) : null);
  if (!(rowDate instanceof Date) || Number.isNaN(rowDate.getTime())) return true;

  const normalizedRowDate = parseISODate(dateString)
    || new Date(Date.UTC(rowDate.getFullYear(), rowDate.getMonth(), rowDate.getDate()));
  const fromDate = parseISODate(flags.dateRange.from);
  const toDate = parseISODate(flags.dateRange.to);
  if (fromDate && normalizedRowDate < fromDate) return false;
  if (toDate && normalizedRowDate > toDate) return false;
  return true;
};

const getFilteredActivityRows = (rows = window.activityData || []) => {
  if (typeof window.activityUtils?.filterActivityRows === 'function') {
    return window.activityUtils.filterActivityRows(rows, flags);
  }

  return (Array.isArray(rows) ? rows : []).filter((row) => (
    (!flags.featuredOnly || ['true', 'yes', 'y', '1', 'x'].includes(`${row?.Featured ?? ''}`.trim().toLowerCase()))
    && isDateInRange(row?.Date) && [
      [flags.channels, row?.Channel, false],
      [flags.technologies, row?.Topics_Product, true],
      [flags.categories, row?.Category, false],
      [flags.authors, row?.Author, false],
      [flags.contributors, row?.Contributor, true],
      [flags.languages, row?.Language, false],
    ].every(([map, val, splitValues]) => passesFilter(map, val, splitValues))
  ));
};

window.getFilteredActivityRows = getFilteredActivityRows;

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
  const desiredTrigger = tableIsActive ? tableTrigger : trendsTrigger;
  const bootstrapTabApi = window.bootstrap?.Tab;

  if (bootstrapTabApi && desiredTrigger) {
    bootstrapTabApi.getOrCreateInstance(desiredTrigger).show();
  } else {
    tableTrigger?.classList.toggle('active', tableIsActive);
    trendsTrigger?.classList.toggle('active', !tableIsActive);
    tableTrigger?.setAttribute('aria-selected', String(tableIsActive));
    trendsTrigger?.setAttribute('aria-selected', String(!tableIsActive));

    tablePane?.classList.toggle('show', tableIsActive);
    tablePane?.classList.toggle('active', tableIsActive);
    trendsPane?.classList.toggle('show', !tableIsActive);
    trendsPane?.classList.toggle('active', !tableIsActive);
  }

  appState.activeTab = requested;
};

const applyFilters = () => {
  if (!isTableRenderReady()) return;
  const allRows = Array.isArray(window.activityData) ? window.activityData : [];
  const filteredRows = getFilteredActivityRows(allRows);

  if (typeof window.updateRenderedTableRows === 'function') {
    window.updateRenderedTableRows(filteredRows);
  } else {
    const rows = [...document.querySelectorAll('#main-table tbody tr')];
    rows.forEach((row) => {
      row.classList.remove('hidden');
    });
  }

  updateFilterSummary(filteredRows.length, allRows.length);
  syncFilterTriggerStates();

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

const clearSingleFilterChip = (filterKey, filterValue) => {
  if (filterKey === 'featuredOnly') {
    flags.featuredOnly = false;
    syncFeaturedOnlyToggleUi();
    applyFilters();
    return;
  }

  if (filterKey === 'date') {
    applyDatePreset(DATE_PRESET_DEFAULT, { reapplyFilters: false });
    applyFilters();
    return;
  }

  const selector = FILTER_CONTROL_SELECTORS[filterKey];
  const select = selector ? document.querySelector(selector) : null;
  if (!select) return;

  [...select.options].forEach((option) => {
    if (option.value === filterValue) setItemSelected(option, false);
  });
  syncTomSelectValue(select);
  syncFlagsFromSelect(selector, filterKey);
  applyFilters();
};

filtersSummaryEl?.addEventListener('click', (event) => {
  const chipButton = event.target.closest('[data-filter-chip]');
  if (!chipButton) return;
  clearSingleFilterChip(chipButton.dataset.filterChip || '', chipButton.dataset.filterValue || '');
});

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

  const targetKey = FILTER_TARGET_KEY_BY_KEYWORD[keyword];
  if (targetKey && e.isTrusted && e.currentTarget?.tomselect) {
    const triggerEl = (
      activeFilterTargetKey === targetKey
        ? activeFilterTriggerEl
        : getFilterTriggerButtons(targetKey)[0] || activeFilterTriggerEl
    );
    suppressFilterPopoverCloseUntil = Date.now() + 600;
    window.setTimeout(() => {
      if (filterPopoverEl?.hidden && triggerEl) {
        openFilterPopover(targetKey, triggerEl);
        return;
      }
      e.currentTarget.tomselect.focus();
      e.currentTarget.tomselect.open();
    }, FILTER_REOPEN_DELAY_MS);
  }
};

window.onDataLoaded = () => {
  const dd = window.dropdownData || {};

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

  const dateInputs = getDateInputs();

  const handleDateRangeChange = () => {
    if (flags.datePreset !== DATE_PRESET_CUSTOM) return;
    flags.dateRange.from = dateInputs.from?.value || '';
    flags.dateRange.to = dateInputs.to?.value || '';
    applyFilters();
  };

  dateInputs.preset?.addEventListener('change', () => {
    applyDatePreset(dateInputs.preset?.value || DATE_PRESET_CUSTOM);
  });
  dateInputs.from?.addEventListener('change', handleDateRangeChange);
  dateInputs.to?.addEventListener('change', handleDateRangeChange);

  applyDatePreset(flags.datePreset, { reapplyFilters: false });

  initApp();
};

const initApp = () => {
  const event = new Event('change');
  ['#topics', '#category', '#channel', '#author', '#contributors', '#language'].forEach((id) => {
    document.querySelector(id)?.dispatchEvent(event);
  });
};

const TOGGLEABLE_COLS = ALL_TABLE_COLS.filter((col) => !col.fixedVisibility);

const featuredOnlyToggleBtn = document.querySelector('#featured-only-toggle');
const featuredOnlyHeaderCell = featuredOnlyToggleBtn?.closest('th');

const syncFeaturedOnlyToggleUi = () => {
  if (!featuredOnlyToggleBtn) return;
  const isActive = !!flags.featuredOnly;
  featuredOnlyToggleBtn.classList.toggle('is-active', isActive);
  featuredOnlyToggleBtn.setAttribute('aria-pressed', String(isActive));
  featuredOnlyToggleBtn.textContent = isActive ? '★' : '☆';
  featuredOnlyHeaderCell?.classList.toggle('is-featured-filter-active', isActive);
};

featuredOnlyToggleBtn?.addEventListener('click', () => {
  flags.featuredOnly = !flags.featuredOnly;
  syncFeaturedOnlyToggleUi();
  applyFilters();
});

const colPickerBtn = document.querySelector('#col-picker-btn');
const colPickerPanel = document.querySelector('#col-picker-panel');
const colPickerWrap = document.querySelector('.col-picker-wrap');
const colOrderList = document.querySelector('#col-order-list');
const resetTableLayoutBtn = document.querySelector('#reset-table-layout-btn');
let draggedColumnKey = '';
let activeResizeState = null;

const getCurrentColumnVisibility = () => TOGGLEABLE_COLS.reduce((acc, col) => {
  const cb = document.querySelector(`#col-toggle-${col.key}`);
  acc[col.key] = cb ? !!cb.checked : !!appState.columns[col.key];
  return acc;
}, {});

const persistLocalTableLayout = () => {
  try {
    localStorage.setItem(TABLE_LAYOUT_STORAGE_KEY, JSON.stringify({
      columns: getCurrentColumnVisibility(),
      order: appState.columnOrder,
      widths: appState.columnWidths,
    }));
  } catch {
    // Ignore storage quota / privacy mode failures. The layout still works for this session.
  }
};

const getColumnWidthLimits = (key) => COLUMN_RESIZE_LIMITS[key] || { min: 72, max: 960 };
const clampColumnWidth = (key, width) => {
  const limits = getColumnWidthLimits(key);
  return Math.round(Math.min(limits.max, Math.max(limits.min, width)));
};

const getTableRowsForLayout = () => (
  [...document.querySelectorAll('#main-table thead tr, #main-table tbody tr, #templateRow tr')]
);

const syncColumnOrderListUi = () => {
  if (!colOrderList) return;
  appState.columnOrder.forEach((key) => {
    const itemEl = colOrderList.querySelector(`[data-col-key="${key}"]`);
    if (itemEl) colOrderList.appendChild(itemEl);
  });

  TOGGLEABLE_COLS.forEach((col) => {
    const itemEl = colOrderList.querySelector(`[data-col-key="${col.key}"]`);
    if (!itemEl) return;
    itemEl.classList.toggle('is-hidden-column', !appState.columns[col.key]);
  });
};

const isColumnVisible = (key) => {
  const col = ALL_TABLE_COLS.find((entry) => entry.key === key);
  if (col?.fixedVisibility) return true;
  return !!appState.columns[key];
};

const getVisibleTableColumnKeys = () => (
  appState.columnOrder.filter((key) => isColumnVisible(key))
);

const getAvailableTableWidth = () => {
  const containerWidth = tableContainerEl?.clientWidth || 0;
  const viewportWidth = window.innerWidth || 0;
  return Math.max(containerWidth, viewportWidth ? Math.min(viewportWidth - 32, containerWidth) : 0);
};

const resetTableHorizontalScroll = () => {
  if (!tableContainerEl) return;
  tableContainerEl.scrollLeft = 0;
};

const computeAutoColumnWidths = () => {
  const visibleKeys = getVisibleTableColumnKeys();
  if (visibleKeys.length === 0) return {};

  const desiredWidths = Object.fromEntries(
    visibleKeys.map((key) => {
      const limits = getColumnWidthLimits(key);
      const storedWidth = appState.columnWidths[key];
      const preferredWidth = AUTO_COLUMN_PREFERRED_WIDTHS[key] || limits.min;
      const desiredWidth = storedWidth
        ? clampColumnWidth(key, storedWidth)
        : Math.min(limits.max, Math.max(limits.min, preferredWidth));
      return [key, desiredWidth];
    }),
  );
  const widths = { ...desiredWidths };
  const desiredTotal = visibleKeys.reduce((sum, key) => sum + desiredWidths[key], 0);
  const availableWidth = getAvailableTableWidth();

  if (!availableWidth) return widths;

  if (desiredTotal >= availableWidth) {
    const ratio = availableWidth / desiredTotal;
    let assigned = 0;
    visibleKeys.forEach((key, index) => {
      const remainingWidth = availableWidth - assigned;
      if (index === visibleKeys.length - 1) {
        widths[key] = Math.max(56, remainingWidth);
        return;
      }
      const nextWidth = Math.max(56, Math.floor(desiredWidths[key] * ratio));
      widths[key] = nextWidth;
      assigned += nextWidth;
    });
    return widths;
  }

  let extraWidth = availableWidth - desiredTotal;
  const growableKeys = visibleKeys.filter((key) => (
    !appState.columnWidths[key] && getColumnWidthLimits(key).max > widths[key]
  ));

  while (extraWidth > 0 && growableKeys.length > 0) {
    let distributed = false;
    growableKeys.forEach((key) => {
      if (extraWidth <= 0) return;
      const maxWidth = getColumnWidthLimits(key).max;
      if (widths[key] >= maxWidth) return;
      widths[key] += 1;
      extraWidth -= 1;
      distributed = true;
    });
    if (!distributed) break;
  }

  return widths;
};

const applyColumnOrderState = () => {
  getTableRowsForLayout().forEach((rowEl) => {
    const cellsByKey = new Map(
      [...rowEl.children]
        .filter((cellEl) => cellEl instanceof HTMLElement)
        .map((cellEl) => [cellEl.getAttribute('data-col'), cellEl]),
    );

    appState.columnOrder.forEach((key) => {
      const cellEl = cellsByKey.get(key);
      if (cellEl) rowEl.appendChild(cellEl);
    });
  });

  syncColumnOrderListUi();
};

const applyColumnWidthState = (key, autoWidths = {}) => {
  const width = autoWidths[key];
  document.querySelectorAll(`#main-table [data-col="${key}"], #templateRow [data-col="${key}"]`).forEach((cellEl) => {
    if (!(cellEl instanceof HTMLElement)) return;
    if (width) {
      cellEl.style.width = `${width}px`;
      cellEl.style.minWidth = '0';
      cellEl.style.maxWidth = `${width}px`;
      return;
    }

    cellEl.style.removeProperty('width');
    cellEl.style.removeProperty('min-width');
    cellEl.style.removeProperty('max-width');
  });
};

const applyAllColumnWidths = () => {
  const autoWidths = computeAutoColumnWidths();
  DEFAULT_COLUMN_ORDER.forEach((key) => applyColumnWidthState(key, autoWidths));
};

const stopColumnResize = () => {
  if (!activeResizeState) return;
  document.body.classList.remove('is-column-resizing');
  window.removeEventListener('mousemove', handleColumnResizeMove);
  window.removeEventListener('mouseup', stopColumnResize);
  persistLocalTableLayout();
  activeResizeState = null;
};

function handleColumnResizeMove(event) {
  if (!activeResizeState) return;
  const nextWidth = clampColumnWidth(
    activeResizeState.key,
    activeResizeState.startWidth + (event.clientX - activeResizeState.startX),
  );
  appState.columnWidths[activeResizeState.key] = nextWidth;
  applyAllColumnWidths();
}

const beginColumnResize = (event, key) => {
  if (event.button !== 0) return;
  const headerEl = document.querySelector(`#main-table thead th[data-col="${key}"]`);
  if (!headerEl) return;

  event.preventDefault();
  event.stopPropagation();
  activeResizeState = {
    key,
    startX: event.clientX,
    startWidth: headerEl.getBoundingClientRect().width,
  };

  document.body.classList.add('is-column-resizing');
  window.addEventListener('mousemove', handleColumnResizeMove);
  window.addEventListener('mouseup', stopColumnResize);
};

const adjustColumnWidthByStep = (key, step) => {
  const headerEl = document.querySelector(`#main-table thead th[data-col="${key}"]`);
  const currentWidth = appState.columnWidths[key]
    || Math.round(headerEl?.getBoundingClientRect().width || getColumnWidthLimits(key).min);
  const nextWidth = clampColumnWidth(key, currentWidth + step);
  appState.columnWidths[key] = nextWidth;
  applyAllColumnWidths();
  persistLocalTableLayout();
};

const resetColumnWidth = (key) => {
  delete appState.columnWidths[key];
  applyAllColumnWidths();
  persistLocalTableLayout();
};

const initColumnResizeHandles = () => {
  document.querySelectorAll('#main-table thead th[data-col]').forEach((headerEl) => {
    if (headerEl.querySelector('.table-col-resize-handle')) return;
    const key = headerEl.getAttribute('data-col');
    const label = ALL_TABLE_COLS.find((col) => col.key === key)?.label || key;
    const handleEl = document.createElement('button');
    handleEl.type = 'button';
    handleEl.className = 'table-col-resize-handle';
    handleEl.setAttribute('aria-label', `Resize ${label} column`);
    handleEl.title = `Resize ${label}`;
    handleEl.addEventListener('mousedown', (event) => beginColumnResize(event, key));
    handleEl.addEventListener('dblclick', (event) => {
      event.preventDefault();
      event.stopPropagation();
      resetColumnWidth(key);
    });
    handleEl.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        adjustColumnWidthByStep(key, -16);
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        adjustColumnWidthByStep(key, 16);
      }
    });
    headerEl.appendChild(handleEl);
  });
};

const syncColumnResizeHandleVisibility = () => {
  const visibleHeaderEls = [...document.querySelectorAll('#main-table thead th[data-col]')]
    .filter((headerEl) => !headerEl.classList.contains('hidden'));

  visibleHeaderEls.forEach((headerEl, index) => {
    const handleEl = headerEl.querySelector('.table-col-resize-handle');
    if (!(handleEl instanceof HTMLElement)) return;
    handleEl.hidden = index === visibleHeaderEls.length - 1;
  });
};

const moveColumnInOrder = (dragKey, targetKey, placement = 'before') => {
  if (!dragKey || !targetKey || dragKey === targetKey) return;
  const nextOrder = appState.columnOrder.filter((key) => key !== dragKey);
  const targetIndex = nextOrder.indexOf(targetKey);
  if (targetIndex === -1) return;
  const insertIndex = placement === 'after' ? targetIndex + 1 : targetIndex;
  nextOrder.splice(insertIndex, 0, dragKey);
  appState.columnOrder = normalizeColumnOrder(nextOrder);
  applyColumnOrderState();
  applyAllColumnWidths();
  persistLocalTableLayout();
};

const clearColumnDropIndicators = () => {
  colOrderList?.querySelectorAll('.col-order-item').forEach((itemEl) => {
    itemEl.classList.remove('is-drop-before', 'is-drop-after', 'is-dragging');
  });
};

colOrderList?.querySelectorAll('.col-order-item').forEach((itemEl) => {
  itemEl.addEventListener('dragstart', (event) => {
    if (event.target instanceof Element && event.target.closest('.col-order-item__toggle')) {
      event.preventDefault();
      return;
    }
    draggedColumnKey = itemEl.getAttribute('data-col-key') || '';
    itemEl.classList.add('is-dragging');
    event.dataTransfer?.setData('text/plain', draggedColumnKey);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  });

  itemEl.addEventListener('dragover', (event) => {
    if (!draggedColumnKey) return;
    event.preventDefault();
    clearColumnDropIndicators();
    const rect = itemEl.getBoundingClientRect();
    const placement = event.clientY >= rect.top + (rect.height / 2) ? 'after' : 'before';
    itemEl.classList.add(placement === 'after' ? 'is-drop-after' : 'is-drop-before');
  });

  itemEl.addEventListener('drop', (event) => {
    event.preventDefault();
    const targetKey = itemEl.getAttribute('data-col-key') || '';
    const rect = itemEl.getBoundingClientRect();
    const placement = event.clientY >= rect.top + (rect.height / 2) ? 'after' : 'before';
    moveColumnInOrder(draggedColumnKey, targetKey, placement);
    clearColumnDropIndicators();
  });

  itemEl.addEventListener('dragend', () => {
    draggedColumnKey = '';
    clearColumnDropIndicators();
  });
});

const closeColumnPicker = () => {
  colPickerPanel?.classList.remove('open');
  colPickerBtn?.setAttribute('aria-expanded', 'false');
};

const openColumnPicker = () => {
  if (!colPickerPanel || !colPickerBtn) return;
  colPickerPanel.classList.add('open');
  colPickerBtn.setAttribute('aria-expanded', 'true');
  colPickerPanel.focus();
};

const toggleColumnPicker = () => {
  if (!colPickerPanel || !colPickerBtn) return;
  if (colPickerPanel.classList.contains('open')) {
    closeColumnPicker();
    colPickerBtn.focus();
    return;
  }

  openColumnPicker();
};

colPickerBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleColumnPicker();
});

colPickerPanel?.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  closeColumnPicker();
  colPickerBtn?.focus();
});

document.addEventListener('mousedown', (event) => {
  if (!colPickerPanel?.classList.contains('open')) return;
  if (colPickerWrap?.contains(event.target)) return;
  closeColumnPicker();
});

const applyColumnToggleState = ({ key, filterId }, checked) => {
  document.querySelectorAll(`[data-col="${key}"]`).forEach((el) => {
    el.classList.toggle('hidden', !checked);
  });

  if (filterId) {
    const filterEl = document.querySelector(filterId);
    if (filterEl) filterEl.style.display = checked ? '' : 'none';
    if (!checked && filterPopoverContentEl?.contains(filterEl)) {
      closeFilterPopover();
    }
  }
};

TOGGLEABLE_COLS.forEach((col) => {
  const cb = document.querySelector(`#col-toggle-${col.key}`);
  if (!cb) return;
  cb.checked = appState.columns[col.key];

  cb.addEventListener('change', () => {
    appState.columns[col.key] = cb.checked;
    applyColumnToggleState(col, cb.checked);
    applyAllColumnWidths();
    resetTableHorizontalScroll();
    syncColumnOrderListUi();
    persistLocalTableLayout();
  });
});

const syncColumnVisibilityWithToggles = () => {
  TOGGLEABLE_COLS.forEach((col) => {
    const cb = document.querySelector(`#col-toggle-${col.key}`);
    if (!cb) return;
    applyColumnToggleState(col, cb.checked);
  });
  syncColumnOrderListUi();
};

const syncTableColumnLayout = () => {
  applyColumnOrderState();
  applyAllColumnWidths();
  syncColumnVisibilityWithToggles();
  initColumnResizeHandles();
  syncColumnResizeHandleVisibility();
};

window.syncColumnVisibilityWithToggles = syncColumnVisibilityWithToggles;
window.syncTableColumnLayout = syncTableColumnLayout;

syncTableColumnLayout();
syncFilterTriggerStates();

window.addEventListener('resize', () => {
  applyAllColumnWidths();
});

const resetFiltersBtn = document.querySelector('#reset-filters-btn');
resetTableLayoutBtn?.addEventListener('click', () => {
  appState.columnOrder = [...DEFAULT_COLUMN_ORDER];
  appState.columnWidths = {};
  syncTableColumnLayout();
  resetTableHorizontalScroll();
  persistLocalTableLayout();
});

resetFiltersBtn?.addEventListener('click', () => {
  closeFilterPopover();
  resetMultiSelect('#topics', 'technologies');
  resetMultiSelect('#category', 'categories');
  resetMultiSelect('#channel', 'channels');
  resetMultiSelect('#author', 'authors');
  resetMultiSelect('#contributors', 'contributors');
  resetMultiSelect('#language', 'languages');

  flags.datePreset = DATE_PRESET_DEFAULT;
  applyDatePreset(DATE_PRESET_DEFAULT, { reapplyFilters: false });
  flags.featuredOnly = false;
  syncFeaturedOnlyToggleUi();

  TOGGLEABLE_COLS.forEach((col) => {
    const cb = document.querySelector(`#col-toggle-${col.key}`);
    if (!cb) return;
    cb.checked = DEFAULT_COLUMN_VISIBILITY[col.key];
    appState.columns[col.key] = cb.checked;
    applyColumnToggleState(col, cb.checked);
  });

  persistLocalTableLayout();
  applyFilters();
});

const previousOnDataLoaded = window.onDataLoaded;
window.onDataLoaded = () => {
  if (typeof previousOnDataLoaded === 'function') previousOnDataLoaded();
  syncTableColumnLayout();
  syncFilterTriggerStates();
  syncFeaturedOnlyToggleUi();
  setActiveTab(appState.activeTab);
  if (trendsTabIsActive() && typeof window.renderCharts === 'function') {
    window.renderCharts();
  }
};

document.querySelector('#tab-table-trigger')?.addEventListener('click', () => {
  closeFilterPopover();
  setActiveTab('table');
});

document.querySelector('#tab-trends-trigger')?.addEventListener('click', () => {
  closeFilterPopover();
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
  url.searchParams.delete('tab');
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
  closeFilterPopover();
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
window.addEventListener('load', () => {
  setActiveTab(appState.activeTab);
});

if (window.tableRenderGate && typeof window.tableRenderGate.onComplete === 'function') {
  window.tableRenderGate.onComplete(() => {
    setActiveTab(appState.activeTab);
    if (trendsTabIsActive() && typeof window.renderCharts === 'function') {
      window.renderCharts();
    }
  });
}
