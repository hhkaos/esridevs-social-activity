const SPREADSHEET_ID = '1oKkHCNbOUpfERu1xC4ePU2XwDSvalEfE0YmTN39cyNg';
const DATA_CACHE_KEY = 'esridevs_data_v1';

window.activityData = [];
window.dropdownData = {};

// ── Extension "New" item highlighting ─────────────────────────────────────────
// When the extension opens the web app via "Open feed", it appends
// ?newItems=<base64-JSON-array> with the URLs of unseen items so the table
// can render "New" badges on those rows without filtering anything out.

window.highlightedItemUrls = (() => {
  try {
    const params = new URL(window.location.href).searchParams;
    const encoded = params.get('newItems');
    if (!encoded) return null;
    const urls = JSON.parse(atob(encoded));
    if (!Array.isArray(urls) || urls.length === 0) return null;
    // Clean the param from the URL so it does not persist across navigations.
    const cleaned = new URL(window.location.href);
    cleaned.searchParams.delete('newItems');
    window.history.replaceState({}, '', cleaned.toString());
    return new Set(urls.map((u) => `${u}`.toLowerCase()));
  } catch {
    return null;
  }
})();
window.definitionData = {
  channelOwnerValueDefinitions: {},
  publisherValueDefinitions: {},
};

// ── Cache helpers ─────────────────────────────────────────────────────────────

function loadDataCache() {
  try {
    const raw = localStorage.getItem(DATA_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveDataCache(activityRows, dropdownRows, authorsRows) {
  try {
    localStorage.setItem(DATA_CACHE_KEY, JSON.stringify({ activityRows, dropdownRows, authorsRows }));
  } catch (err) {
    console.warn('Cache write failed (storage quota?):', err);
  }
}

function dataHasChanged(freshActivity, cachedActivity) {
  const sanitizedFresh = sanitizeActivityRows(freshActivity);
  const sanitizedCached = sanitizeActivityRows(cachedActivity);
  const freshSig = JSON.stringify(sanitizedFresh);
  const cachedSig = JSON.stringify(sanitizedCached);
  return freshSig !== cachedSig;
}

// ── Toast ─────────────────────────────────────────────────────────────────────

const toastEl = document.querySelector('#update-toast');
const toastTextEl = document.querySelector('#update-toast-text');
let toastTimer = null;

function showToast(message, type, autoDismissMs = 0) {
  if (!toastEl) return;
  if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }

  const iconEl = toastEl.querySelector('.update-toast__icon');
  const icons = { checking: '↻', updating: '↻', uptodate: '✓' };
  if (iconEl) iconEl.textContent = icons[type] || '↻';

  toastEl.dataset.type = type;
  if (toastTextEl) toastTextEl.textContent = message;
  toastEl.hidden = false;
  void toastEl.offsetWidth; // force reflow for re-animation
  toastEl.classList.add('toast-visible');

  if (autoDismissMs > 0) {
    toastTimer = setTimeout(hideToast, autoDismissMs);
  }
}

function hideToast() {
  if (!toastEl) return;
  toastEl.classList.remove('toast-visible');
  setTimeout(() => { if (toastEl) toastEl.hidden = true; }, 350);
}

// ── Loading status ────────────────────────────────────────────────────────────

const LOADING_MESSAGES = [
  'Reading spreadsheet updates',
  'Matching filters and records',
  'Preparing table view',
  'Syncing chart inputs',
];

const loadingStatusEl = document.querySelector('#loading-status');
const loadingStatusTextEl = document.querySelector('#loading-status-text');
const tableContainerEl = document.querySelector('.table-container');
const tableLoadingSkeletonEl = document.querySelector('#table-loading-skeleton');
const tableErrorPanelEl = document.querySelector('#table-error-panel');
const tableErrorTextEl = document.querySelector('#table-error-text');
let loadingTimerId = null;
let loadingMessageIndex = 0;
const TABLE_SURFACE_STATES = {
  LOADING: 'loading',
  READY: 'ready',
  ERROR: 'error',
};

const setLoadingMessage = (msg) => {
  if (!loadingStatusTextEl) return;
  loadingStatusTextEl.textContent = `${msg}...`;
};

const setTableSurfaceState = (state, { message = '' } = {}) => {
  const isLoading = state === TABLE_SURFACE_STATES.LOADING;
  const isReady = state === TABLE_SURFACE_STATES.READY;
  const isError = state === TABLE_SURFACE_STATES.ERROR;

  if (tableContainerEl) tableContainerEl.hidden = !isReady;
  if (tableLoadingSkeletonEl) tableLoadingSkeletonEl.hidden = !isLoading;

  if (tableErrorPanelEl) {
    tableErrorPanelEl.hidden = !isError;
  }
  if (isError && tableErrorTextEl && message) {
    tableErrorTextEl.textContent = message;
  }
};

const startLoadingStatus = () => {
  if (!loadingStatusEl) return;
  setTableSurfaceState(TABLE_SURFACE_STATES.LOADING);
  loadingStatusEl.hidden = false;
  loadingStatusEl.classList.remove('is-error');
  loadingMessageIndex = 0;
  setLoadingMessage(LOADING_MESSAGES[loadingMessageIndex]);
  loadingTimerId = window.setInterval(() => {
    loadingMessageIndex = (loadingMessageIndex + 1) % LOADING_MESSAGES.length;
    setLoadingMessage(LOADING_MESSAGES[loadingMessageIndex]);
  }, 1700);
};

const stopLoadingStatus = () => {
  if (loadingTimerId) {
    window.clearInterval(loadingTimerId);
    loadingTimerId = null;
  }
  if (loadingStatusEl) loadingStatusEl.hidden = true;
};

const showLoadingError = () => {
  if (loadingTimerId) {
    window.clearInterval(loadingTimerId);
    loadingTimerId = null;
  }
  const message = 'Could not load activity feed. Please refresh';
  setTableSurfaceState(TABLE_SURFACE_STATES.ERROR, { message });
  if (!loadingStatusEl) return;
  loadingStatusEl.hidden = false;
  loadingStatusEl.classList.add('is-error');
  setLoadingMessage(message);
};

// ── Data helpers ──────────────────────────────────────────────────────────────

const fetchJsonOrThrow = (url) =>
  fetch(url).then((response) => {
    if (!response.ok) throw new Error(`Request failed: ${response.status} ${response.statusText}`);
    return response.json();
  });

const {
  hasText,
  isMeaningfulValue,
  pickFirst,
  extractContentLinks,
  extractSocialLinks,
  sanitizeActivityRows,
  runPostRefreshUiSync,
  createRenderGate,
  validateSheetSchema,
  buildSchemaMismatchMessage,
  buildValueDefinitionMap,
  resolveValueDefinition,
  OPEN_SHEET_FIELD_ALIASES,
} = window.activityUtils || {};

if (
  [
    hasText,
    isMeaningfulValue,
    pickFirst,
    extractContentLinks,
    extractSocialLinks,
    sanitizeActivityRows,
    runPostRefreshUiSync,
    createRenderGate,
    validateSheetSchema,
    buildSchemaMismatchMessage,
    buildValueDefinitionMap,
    resolveValueDefinition,
  ]
    .some((fn) => typeof fn !== 'function')
) {
  throw new Error('activity-utils.js must be loaded before load-table.js');
}

const PUBLISHER_FIELD_KEYS = OPEN_SHEET_FIELD_ALIASES?.publisher || ['Publisher', 'Author', 'Authors'];
const PEOPLE_INVOLVED_FIELD_KEYS = OPEN_SHEET_FIELD_ALIASES?.peopleInvolved || ['People involved', 'People Involved', 'People_involved', 'Contributors', 'Contributor', 'Authors'];
const CHANNEL_OWNER_FIELD_KEYS = OPEN_SHEET_FIELD_ALIASES?.channelOwner || ['Channel owner', 'Channel Owner', 'Channel_owner', 'ChannelOwner', 'Channel'];
const LANGUAGE_FIELD_KEYS = OPEN_SHEET_FIELD_ALIASES?.language || ['Language', 'Languages'];
const TECHNOLOGY_FIELD_KEYS = OPEN_SHEET_FIELD_ALIASES?.technology || ['Topics_Product', 'Technology', 'Technologies'];
const CATEGORY_FIELD_KEYS = OPEN_SHEET_FIELD_ALIASES?.category || ['Category', 'Category / Content type', 'Content type'];
const PUBLISHER_DEFINITION_KEYS = OPEN_SHEET_FIELD_ALIASES?.publisherValueDefinition || ['Publisher_value_definition', 'Publisher value definition', 'Author_value_definition'];
const CHANNEL_OWNER_DEFINITION_KEYS = OPEN_SHEET_FIELD_ALIASES?.channelOwnerValueDefinition || ['Channel_owner_value_definition', 'Channel owner value definition', 'ChannelOwner_value_definition', 'Channel_value_definition'];

const schemaWarningBannerEl = document.querySelector('#schema-warning-banner');
const definitionsModalEl = document.querySelector('#definitions-modal');
const definitionsModalTitleEl = document.querySelector('#definitions-modal-title');
const definitionsModalBodyEl = document.querySelector('#definitions-modal-body');

const FIELD_DEFINITION_TEXT = {
  contributor: 'People who had relevant involvement in creating, publishing, or distributing this piece.',
  channel: 'Who owns or administers the channel, site, or account where the piece appears.',
  author: 'Who publishes, issues, or officially stands behind the piece in this resource.',
};

const FIELD_LABELS = {
  contributor: 'People involved',
  channel: 'Channel owner',
  author: 'Publisher',
};

const showSchemaWarning = (message) => {
  if (!schemaWarningBannerEl) return;
  schemaWarningBannerEl.textContent = message;
  schemaWarningBannerEl.hidden = false;
};

const hideSchemaWarning = () => {
  if (!schemaWarningBannerEl) return;
  schemaWarningBannerEl.hidden = true;
  schemaWarningBannerEl.textContent = '';
};

const validateOpenSheetSchemaOrThrow = ({ activityRows, dropdownRows }) => {
  const schemaValidation = validateSheetSchema({ activityRows, dropdownRows });
  if (schemaValidation.isValid) {
    hideSchemaWarning();
    return;
  }

  const mismatchMessage = buildSchemaMismatchMessage(schemaValidation);
  showSchemaWarning(mismatchMessage);
  throw new Error(mismatchMessage);
};

const mergeUniqueItems = (currentItems, nextItems = []) => {
  const merged = Array.isArray(currentItems) ? [...currentItems] : [];
  const seen = new Set(merged.map((item) => item?.url || `${item}`));

  nextItems.forEach((item) => {
    const key = item?.url || `${item}`;
    if (!key || seen.has(key)) return;
    seen.add(key);
    merged.push(item);
  });

  return merged;
};

const mergeSocialLinks = (currentLinks, nextLinks = []) => {
  const byPlatform = new Map();
  const order = ['linkedin', 'x', 'bluesky'];
  const platformLabel = {
    linkedin: 'LinkedIn',
    x: 'X/Twitter',
    bluesky: 'Bluesky',
  };

  const normalizeTargets = (link) => {
    const rawTargets = Array.isArray(link?.targets) && link.targets.length > 0
      ? link.targets
      : [{ url: link?.url, title: link?.title, label: link?.title }];
    const seen = new Set();
    const targets = [];
    rawTargets.forEach((target) => {
      const key = `${target?.url || ''}|${target?.label || target?.title || ''}`;
      if (!key || seen.has(key)) return;
      seen.add(key);
      targets.push({
        url: target.url,
        title: target.title || link?.title || '',
        label: target.label || target.title || link?.title || '',
      });
    });
    return targets;
  };

  const push = (link) => {
    const platform = link?.platform;
    if (!platform) return;
    const targets = normalizeTargets(link);
    if (targets.length === 0) return;

    if (!byPlatform.has(platform)) {
      byPlatform.set(platform, {
        platform,
        targets: [...targets],
      });
      return;
    }

    const existing = byPlatform.get(platform);
    const seen = new Set(existing.targets.map((target) => `${target.url}|${target.label || target.title || ''}`));
    targets.forEach((target) => {
      const key = `${target.url}|${target.label || target.title || ''}`;
      if (seen.has(key)) return;
      seen.add(key);
      existing.targets.push(target);
    });
  };

  (Array.isArray(currentLinks) ? currentLinks : []).forEach(push);
  nextLinks.forEach(push);

  return order
    .filter((platform) => byPlatform.has(platform))
    .map((platform) => {
      const link = byPlatform.get(platform);
      return {
        platform,
        title: link.targets.length > 1
          ? `Open ${platformLabel[platform] || platform} links`
          : link.targets[0].title,
        url: link.targets[0].url,
        targets: link.targets,
      };
    });
};

const FEATURED_FIELD_KEYS = ['Featured', 'featured', 'Featured?', 'Featured ?', 'FEATURED'];
const FEATURED_FIELD_CANONICALS = new Set(
  FEATURED_FIELD_KEYS.map((key) => `${key}`.toLowerCase().replace(/[^a-z0-9]/g, ''))
);

const getFeaturedCell = (row) => {
  const direct = pickFirst(row, FEATURED_FIELD_KEYS);
  if (direct) return direct;
  const entries = Object.entries(row || {});
  for (const [rawKey, rawValue] of entries) {
    const canonicalKey = `${rawKey ?? ''}`.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!FEATURED_FIELD_CANONICALS.has(canonicalKey)) continue;
    const normalizedValue = `${rawValue ?? ''}`.trim();
    if (normalizedValue) return normalizedValue;
  }
  return '';
};

const normalizeForKey = (value) => `${value ?? ''}`
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .trim();

const escapeHtml = (value) => `${value ?? ''}`
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const buildValueDefinitionItems = (values, definitions) => {
  const safeValues = Array.isArray(values) ? values : [];
  if (safeValues.length === 0) {
    return '<p class="definitions-empty">No values available.</p>';
  }

  const items = safeValues.map((value) => {
    const definition = resolveValueDefinition(definitions, value) || 'No definition provided yet.';
    return `<li class="definitions-list__item"><span class="definitions-list__value">${escapeHtml(value)}</span><span class="definitions-list__meaning">${escapeHtml(definition)}</span></li>`;
  }).join('');

  return `<ul class="definitions-list">${items}</ul>`;
};

const renderDefinitionModalSection = (fieldKey) => {
  if (!definitionsModalBodyEl || !definitionsModalTitleEl) return;

  const normalizedField = `${fieldKey ?? ''}`.trim().toLowerCase();
  const fieldLabel = FIELD_LABELS[normalizedField] || 'Definition';
  definitionsModalTitleEl.textContent = `${fieldLabel} definitions`;

  const fieldDefinition = FIELD_DEFINITION_TEXT[normalizedField] || '';
  let valueListHtml = '';

  if (normalizedField === 'channel') {
    valueListHtml = buildValueDefinitionItems(
      window.dropdownData?.channels || [],
      window.definitionData?.channelOwnerValueDefinitions || {},
    );
  } else if (normalizedField === 'author') {
    valueListHtml = buildValueDefinitionItems(
      window.dropdownData?.authors || [],
      window.definitionData?.publisherValueDefinitions || {},
    );
  }

  const fieldDescriptionHtml = fieldDefinition
    ? `<p class="definitions-field-text">${escapeHtml(fieldDefinition)}</p>`
    : '';

  const valuesSectionHtml = valueListHtml
    ? `<section class="definitions-section"><h6 class="definitions-section__title">Values</h6>${valueListHtml}</section>`
    : '';

  definitionsModalBodyEl.innerHTML = `
    <section class="definitions-section">
      <h6 class="definitions-section__title">Meaning</h6>
      ${fieldDescriptionHtml || '<p class="definitions-empty">No definition provided yet.</p>'}
    </section>
    ${valuesSectionHtml}
  `;
};

const openDefinitionModal = (fieldKey) => {
  renderDefinitionModalSection(fieldKey);
  if (!definitionsModalEl || !window.bootstrap?.Modal) return;
  const modal = window.bootstrap.Modal.getOrCreateInstance(definitionsModalEl);
  modal.show();
};

const initDefinitionTriggers = () => {
  document.querySelectorAll('[data-definition-trigger]').forEach((buttonEl) => {
    buttonEl.addEventListener('click', (event) => {
      event.preventDefault();
      const field = buttonEl.getAttribute('data-definition-field');
      openDefinitionModal(field);
    });
  });
};

const socialIconClass = (platform) => ({
  linkedin: 'fa-brands fa-linkedin',
  x: 'fa-brands fa-x-twitter',
  bluesky: 'fa-brands fa-bluesky',
  shared: 'fa-solid fa-share-nodes',
}[platform] || 'fa-solid fa-share-nodes');

let socialMenuIdCounter = 0;
const renderSocialLink = ({ url, platform, title, targets = [] }) => {
  const safeTargets = Array.isArray(targets) && targets.length > 0 ? targets : [{ url, title, label: title }];
  if (safeTargets.length === 1) {
    return `<a href="${safeTargets[0].url}" target="_blank" rel="noopener noreferrer" class="social-link social-link--${platform}" title="${safeTargets[0].title}" aria-label="${safeTargets[0].title}">
      <i class="${socialIconClass(platform)}" aria-hidden="true"></i>
    </a>`;
  }

  const menuId = `social-menu-${platform}-${socialMenuIdCounter++}`;
  const menuItems = safeTargets.map((target) => `<li><a class="dropdown-item" href="${target.url}" target="_blank" rel="noopener noreferrer" title="${target.title}">${target.label || target.title}</a></li>`).join('');

  return `<div class="dropdown social-link-group">
    <button class="social-link social-link--${platform} social-link--menu" type="button" data-bs-toggle="dropdown" aria-expanded="false" aria-haspopup="true" aria-controls="${menuId}" title="${title}" aria-label="${title}">
      <i class="${socialIconClass(platform)}" aria-hidden="true"></i>
      <span class="social-link__count" aria-hidden="true">${safeTargets.length}</span>
    </button>
    <ul id="${menuId}" class="dropdown-menu dropdown-menu-end social-link-menu">
      ${menuItems}
    </ul>
  </div>`;
};

const initSocialTooltips = () => {
  if (!window.bootstrap?.Tooltip) return;
  document.querySelectorAll('.social-na[data-bs-toggle="tooltip"]').forEach((el) => {
    window.bootstrap.Tooltip.getOrCreateInstance(el, {
      html: true,
      container: 'body',
      trigger: 'hover focus',
    });
  });
};

let shareNudgeHandlersInitialized = false;

const splitPeopleList = (value) => `${value ?? ''}`
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

const formatPeopleList = (names) => {
  if (names.length <= 1) return names[0] || '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
};

const buildShareNudgeText = (row) => {
  const authorNames = splitPeopleList(row?.dataset?.authors);
  const contributorNames = splitPeopleList(row?.dataset?.contributors);
  const uniqueNames = [...new Set([...authorNames, ...contributorNames])];
  if (uniqueNames.length > 0) {
    const displayNames = uniqueNames.slice(0, 3);
    const suffix = uniqueNames.length > 3 ? ', and other people involved' : '';
    return `Found this useful? Help ${formatPeopleList(displayNames)}${suffix} by sharing it with your network.`;
  }
  return 'Found this useful? Help the people involved by sharing it with your network.';
};

const dismissShareNudgeForRow = (row) => {
  if (!row) return;
  row.classList.remove('share-nudge-active');
  const nudgeEl = row.querySelector('.share-nudge');
  if (nudgeEl) nudgeEl.hidden = true;
};

const activateShareNudgeForRow = (row) => {
  if (!row || row.classList.contains('hidden')) return;
  if (!row.querySelector('.social-links .social-link')) return;

  const nudgeEl = row.querySelector('.share-nudge');
  if (nudgeEl) {
    const textEl = nudgeEl.querySelector('.share-nudge__text');
    if (textEl) textEl.textContent = buildShareNudgeText(row);
    nudgeEl.hidden = false;
  }

  row.classList.add('share-nudge-active');
};

const initShareNudges = () => {
  if (shareNudgeHandlersInitialized) return;
  const tableEl = document.querySelector('#main-table');
  if (!tableEl) return;

  tableEl.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const closeBtnEl = target.closest('.share-nudge__close');
    if (closeBtnEl) {
      dismissShareNudgeForRow(closeBtnEl.closest('tr'));
      return;
    }

    const contentLinkEl = target.closest('.table-title-link');
    if (!contentLinkEl) return;
    activateShareNudgeForRow(contentLinkEl.closest('tr'));
  });

  shareNudgeHandlersInitialized = true;
};

const getDomainLabel = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return 'link';
  }
};

const dedupeActivityRows = (rows) => {
  const byEntry = new Map();

  rows.forEach((row, index) => {
    const rowKey = [
      pickFirst(row, ['Title', 'Content title']),
      pickFirst(row, ['Date']),
      pickFirst(row, ['URL', 'Url', 'Link']),
      pickFirst(row, ['Linkedin', 'LinkedIn']),
      pickFirst(row, ['X/Twitter', 'X', 'Twitter']),
      pickFirst(row, ['Bluesky', 'BlueSky']),
      pickFirst(row, ['EsriDevs Shared', 'EsriDevs shared', 'EsriDevs\nShared']),
      pickFirst(row, PUBLISHER_FIELD_KEYS),
      pickFirst(row, PEOPLE_INVOLVED_FIELD_KEYS),
      pickFirst(row, CHANNEL_OWNER_FIELD_KEYS),
      pickFirst(row, LANGUAGE_FIELD_KEYS),
      pickFirst(row, TECHNOLOGY_FIELD_KEYS),
      pickFirst(row, CATEGORY_FIELD_KEYS),
    ]
      .map(normalizeForKey)
      .join('|') || `row:${index}`;
    const contentLinks = extractContentLinks(row);
    const socialLinks = extractSocialLinks(row);

    if (!byEntry.has(rowKey)) {
      byEntry.set(rowKey, {
        ...row,
        __contentLinks: contentLinks,
        __socialLinks: socialLinks,
      });
      return;
    }

    const existing = byEntry.get(rowKey);
    existing.__contentLinks = mergeUniqueItems(existing.__contentLinks, contentLinks);
    existing.__socialLinks = mergeSocialLinks(existing.__socialLinks, socialLinks);

    if (!isTruthyCell(getFeaturedCell(existing)) && isTruthyCell(getFeaturedCell(row))) {
      existing['Featured'] = getFeaturedCell(row);
    }

    if (!hasText(existing['Date']) && hasText(row['Date'])) {
      existing['Date'] = row['Date'];
    }
  });

  return [...byEntry.values()];
};

const uniqueColumnValues = (rows, keys) => [
  ...new Set(
    rows
      .map((row) => pickFirst(row, keys))
      .filter(Boolean)
  ),
];

const isTruthyCell = (value) => {
  const normalized = `${value ?? ''}`.trim().toLowerCase();
  return ['true', 'yes', 'y', '1', 'x'].includes(normalized);
};

const TABLE_RENDER_CHUNK_SIZE = 50;
const renderGate = createRenderGate();
window.tableRenderGate = renderGate;

const getFrameScheduler = () => (typeof window.requestAnimationFrame === 'function'
  ? window.requestAnimationFrame.bind(window)
  : (cb) => window.setTimeout(cb, 16));
const scheduleFrame = getFrameScheduler();

const FILTER_INPUT_SELECTORS = [
  '#topics',
  '#category',
  '#channel',
  '#author',
  '#contributors',
  '#language',
  '#date-preset',
  '#date-from',
  '#date-to',
  '#reset-filters-btn',
  '#share-view-btn',
  '#col-picker-btn',
  '#tab-trends-trigger',
];

const setSelectEnabledState = (select, enabled) => {
  if (!select) return;
  select.disabled = !enabled;
  if (!select.tomselect) return;
  if (enabled) {
    select.tomselect.enable();
  } else {
    select.tomselect.disable();
  }
};

const setInteractiveUiEnabled = (enabled) => {
  FILTER_INPUT_SELECTORS.forEach((selector) => {
    const el = document.querySelector(selector);
    if (!el) return;
    el.disabled = !enabled;
    if (selector === '#tab-trends-trigger') {
      el.classList.toggle('disabled', !enabled);
      el.setAttribute('aria-disabled', String(!enabled));
    }
  });

  document.querySelectorAll('select.filter-multiselect').forEach((select) => {
    setSelectEnabledState(select, enabled);
  });

  document.querySelectorAll('#col-picker-panel input[type="checkbox"]').forEach((checkbox) => {
    checkbox.disabled = !enabled;
  });
};

const showRenderingStatus = (processed, total) => {
  if (loadingTimerId) {
    window.clearInterval(loadingTimerId);
    loadingTimerId = null;
  }
  if (!loadingStatusEl) return;
  loadingStatusEl.hidden = false;
  loadingStatusEl.classList.remove('is-error');
  const suffix = total > 0 ? ` (${processed}/${total})` : '';
  setLoadingMessage(`Rendering activity table${suffix}`);
};

const beginTableRender = (totalRows) => {
  renderGate.reset();
  setTableSurfaceState(TABLE_SURFACE_STATES.LOADING);
  setInteractiveUiEnabled(false);
  showRenderingStatus(0, totalRows);
};

const completeTableRender = () => {
  setTableSurfaceState(TABLE_SURFACE_STATES.READY);
  setInteractiveUiEnabled(true);
  renderGate.markComplete();
  stopLoadingStatus();
};

const TABLE_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

const parseDateInput = (value) => {
  const raw = `${value ?? ''}`.trim();
  if (!raw) return null;

  const isoDate = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoDate) {
    const [, year, month, day] = isoDate;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  }

  const slashDate = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashDate) {
    const [, month, day, year] = slashDate;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  }

  const parsed = new Date(raw);
  if (isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
};

// ── Data processing ───────────────────────────────────────────────────────────

function buildDropdownData(dropdownRows, authorsRows) {
  const authorsFromSheet = [...new Set(
    authorsRows
      .map((row) => Object.values(row).map(v => `${v ?? ''}`.trim()).find(Boolean))
      .filter(Boolean)
  )];
  const contributorsFromDropdown = uniqueColumnValues(dropdownRows, PEOPLE_INVOLVED_FIELD_KEYS);
  const contributors = [...new Set([...contributorsFromDropdown, ...authorsFromSheet])];
  return {
    technologies: uniqueColumnValues(dropdownRows, TECHNOLOGY_FIELD_KEYS),
    categories:   uniqueColumnValues(dropdownRows, CATEGORY_FIELD_KEYS),
    channels:     uniqueColumnValues(dropdownRows, CHANNEL_OWNER_FIELD_KEYS),
    authors:      uniqueColumnValues(dropdownRows, PUBLISHER_FIELD_KEYS),
    contributors,
    languages:    uniqueColumnValues(dropdownRows, LANGUAGE_FIELD_KEYS),
  };
}

function buildDefinitionData(dropdownRows) {
  return {
    channelOwnerValueDefinitions: buildValueDefinitionMap({
      rows: dropdownRows,
      valueKeys: CHANNEL_OWNER_FIELD_KEYS,
      definitionKeys: CHANNEL_OWNER_DEFINITION_KEYS,
    }),
    publisherValueDefinitions: buildValueDefinitionMap({
      rows: dropdownRows,
      valueKeys: PUBLISHER_FIELD_KEYS,
      definitionKeys: PUBLISHER_DEFINITION_KEYS,
    }),
  };
}

async function processAndRender(activityRows, dropdownRows, authorsRows) {
  validateOpenSheetSchemaOrThrow({ activityRows, dropdownRows });

  const sanitizedActivityRows = sanitizeActivityRows(activityRows);
  const dedupedActivityRows = dedupeActivityRows(sanitizedActivityRows);
  window.activityData = dedupedActivityRows;
  window.dropdownData = buildDropdownData(dropdownRows, authorsRows);
  window.definitionData = buildDefinitionData(dropdownRows);
  beginTableRender(dedupedActivityRows.length);
  await renderTableRows(dedupedActivityRows);
  completeTableRender();
  if (typeof window.onDataLoaded === 'function') {
    window.onDataLoaded();
  }
}

async function refreshTableOnly(freshActivity) {
  const sanitizedActivityRows = sanitizeActivityRows(freshActivity);
  const dedupedActivityRows = dedupeActivityRows(sanitizedActivityRows);
  window.activityData = dedupedActivityRows;
  if (typeof window.handleActivityDataRefresh === 'function') {
    window.handleActivityDataRefresh();
  }
  beginTableRender(dedupedActivityRows.length);
  await renderTableRows(dedupedActivityRows);
  completeTableRender();
  runPostRefreshUiSync({
    syncColumnVisibility: window.syncColumnVisibilityWithToggles,
    applyFilters: window.applyFilters,
  });
  if (typeof window.renderCharts === 'function') {
    const trendsPane = document.querySelector('#tab-trends');
    if (trendsPane?.classList.contains('active')) {
      window.renderCharts();
    }
  }
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function createTableRowClone(entry, template) {
  const clone = template.content.cloneNode(true);
  const row = clone.firstElementChild;
  const featured = isTruthyCell(getFeaturedCell(entry));

  if (featured) row.classList.add('selected');

  const td = clone.querySelectorAll('td');

  const date = pickFirst(entry, ['Date']);
  const title = pickFirst(entry, ['Title', 'Content title']);
  const contentLinks = Array.isArray(entry.__contentLinks) ? entry.__contentLinks : extractContentLinks(entry);
  const author = pickFirst(entry, PUBLISHER_FIELD_KEYS);
  const contributors = pickFirst(entry, PEOPLE_INVOLVED_FIELD_KEYS);
  const channel = pickFirst(entry, CHANNEL_OWNER_FIELD_KEYS);
  const language = pickFirst(entry, LANGUAGE_FIELD_KEYS);
  const technology = pickFirst(entry, TECHNOLOGY_FIELD_KEYS);
  const category = pickFirst(entry, CATEGORY_FIELD_KEYS);
  const socialLinks = Array.isArray(entry.__socialLinks) ? entry.__socialLinks : extractSocialLinks(entry);

  const hasRenderableData = [
    title,
    date,
    author,
    contributors,
    channel,
    language,
    technology,
    category,
  ].some(isMeaningfulValue)
    || contentLinks.length > 0
    || socialLinks.length > 0;

  if (!hasRenderableData) return null;

  td[0].innerText = formatDate(date);
  row.setAttribute('data-date', date);
  row.setAttribute('data-featured', featured ? '1' : '0');

  const domainLinks = contentLinks
    .map((link) => `<a href="${link.url}" target="_blank" rel="noopener noreferrer" class="table-title-link small">${getDomainLabel(link.url)}</a>`)
    .join(', ');

  const featuredMarker = featured
    ? '<span class="featured-row-star" aria-label="Featured" title="Featured">★</span> '
    : '';

  const rowUrl = pickFirst(entry, ['URL', 'Url', 'Link']).toLowerCase();
  const newBadge = window.highlightedItemUrls?.has(rowUrl)
    ? ' <span class="badge-new" aria-label="New item">New</span>'
    : '';

  td[1].innerHTML = `
    <span>${featuredMarker}${title}${newBadge}</span>
    ${domainLinks ? `<div class="small text-muted mt-1">Posted in: ${domainLinks}</div>` : ''}
  `;

  td[2].innerText = author;
  row.setAttribute('data-authors', author);
  row.setAttribute('data-contributors', contributors);

  td[3].innerText = channel;
  row.setAttribute('data-channels', channel);

  td[4].innerText = language;
  row.setAttribute('data-languages', language);

  if (socialLinks.length) {
    td[5].innerHTML = `
      <div class="social-links">${socialLinks.map(renderSocialLink).join('')}</div>
      <div class="share-nudge" hidden aria-live="polite">
        <span class="share-nudge__text"></span>
        <button class="share-nudge__close" type="button" aria-label="Dismiss share suggestion">×</button>
      </div>
    `;
  } else {
    const socialHelpTooltipHtml = `No social links available.<br>If you know this content was shared, <a href='https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit?usp=sharing' target='_blank' rel='noopener noreferrer'>add it via Add new activity</a> or contact <a href='mailto:developers@esri.com'>developers@esri.com</a>.`;
    td[5].innerHTML = `<span class="social-na" data-bs-toggle="tooltip" data-bs-html="true" data-bs-title="${socialHelpTooltipHtml}" aria-label="No social links available. Hover for details.">N/A <i class="fa-solid fa-circle-info social-na__icon" aria-hidden="true"></i></span>`;
  }

  td[6].innerText = contributors;

  td[7].innerText = technology;
  row.setAttribute('data-technologies', technology);

  td[8].innerText = category;
  row.setAttribute('data-categories', category);

  return clone;
}

function renderTableRows(rows) {
  if (!('content' in document.createElement('template'))) return Promise.resolve();

  const liveTableBody = document.querySelector('#main-table tbody');
  const template = document.querySelector('#templateRow');
  if (!liveTableBody || !template) return Promise.resolve();

  const workingTableBody = document.createElement('tbody');
  const safeRows = Array.isArray(rows) ? rows : [];
  const totalRows = safeRows.length;

  return new Promise((resolve) => {
    let index = 0;
    const renderChunk = () => {
      const fragment = document.createDocumentFragment();
      let processedInChunk = 0;

      while (index < totalRows && processedInChunk < TABLE_RENDER_CHUNK_SIZE) {
        const clone = createTableRowClone(safeRows[index], template);
        if (clone) fragment.appendChild(clone);
        index += 1;
        processedInChunk += 1;
      }

      if (fragment.childNodes.length > 0) {
        workingTableBody.appendChild(fragment);
      }

      showRenderingStatus(index, totalRows);

      if (index < totalRows) {
        scheduleFrame(renderChunk);
        return;
      }

      liveTableBody.replaceWith(workingTableBody);
      initSocialTooltips();
      resolve();
    };

    scheduleFrame(renderChunk);
  });
}

function formatDate(dateString) {
  const date = parseDateInput(dateString);
  if (!date) return dateString || '';
  return TABLE_DATE_FORMATTER.format(date);
}

// ── Init ──────────────────────────────────────────────────────────────────────
// Start the fetch immediately to maximize parallelism, regardless of cache state.
// Rendering is deferred to DOMContentLoaded so that apply-filters.js and charts.js
// are guaranteed to have run and exposed their callbacks on window.

const cachedData = loadDataCache();
setInteractiveUiEnabled(false);
startLoadingStatus();

const dataFetchPromise = Promise.all([
  fetchJsonOrThrow(`https://opensheet.elk.sh/${SPREADSHEET_ID}/Activity`),
  fetchJsonOrThrow(`https://opensheet.elk.sh/${SPREADSHEET_ID}/Dropdowns`),
  fetchJsonOrThrow(`https://opensheet.elk.sh/${SPREADSHEET_ID}/Authors`),
]);

window.addEventListener('DOMContentLoaded', () => {
  document.querySelector('#update-toast-close')?.addEventListener('click', hideToast);
  initDefinitionTriggers();
  initShareNudges();

  if (cachedData) {
    // Render from cache immediately — all other scripts are now ready
    processAndRender(cachedData.activityRows, cachedData.dropdownRows, cachedData.authorsRows)
      .catch((err) => {
        console.error('Failed to render cached data:', err);
        showLoadingError();
      });
    showToast('Checking for updates\u2026', 'checking');

    dataFetchPromise
      .then(([freshActivity, freshDropdowns, freshAuthors]) => {
        validateOpenSheetSchemaOrThrow({
          activityRows: freshActivity,
          dropdownRows: freshDropdowns,
        });
        saveDataCache(sanitizeActivityRows(freshActivity), freshDropdowns, freshAuthors);
        if (dataHasChanged(freshActivity, cachedData.activityRows)) {
          showToast('New data available \u2014 refreshing\u2026', 'updating');
          setTimeout(() => {
            refreshTableOnly(freshActivity)
              .then(() => {
                showToast('Activity feed updated', 'uptodate', 3000);
              })
              .catch((err) => {
                console.error('Failed to refresh table:', err);
                showLoadingError();
                hideToast();
              });
          }, 2000);
        } else {
          showToast('Already up to date', 'uptodate', 2500);
        }
      })
      .catch(err => {
        console.error('Background refresh failed:', err);
        hideToast();
      });

  } else {
    // No cache — wait for fresh data before rendering
    dataFetchPromise
      .then(([activityRows, dropdownRows, authorsRows]) => {
        saveDataCache(sanitizeActivityRows(activityRows), dropdownRows, authorsRows);
        return processAndRender(activityRows, dropdownRows, authorsRows);
      })
      .catch(err => {
        console.error('Failed to load data:', err);
        showLoadingError();
      });
  }
});
