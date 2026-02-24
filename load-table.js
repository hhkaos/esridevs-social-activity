const SPREADSHEET_ID = '1oKkHCNbOUpfERu1xC4ePU2XwDSvalEfE0YmTN39cyNg';
const DATA_CACHE_KEY = 'esridevs_data_v1';

window.activityData = [];
window.dropdownData = {};

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
  if (sanitizedFresh.length !== sanitizedCached.length) return true;
  const freshSig = JSON.stringify(sanitizedFresh.slice(0, 3));
  const cachedSig = JSON.stringify(sanitizedCached.slice(0, 3));
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
let loadingTimerId = null;
let loadingMessageIndex = 0;

const setLoadingMessage = (msg) => {
  if (!loadingStatusTextEl) return;
  loadingStatusTextEl.textContent = `${msg}...`;
};

const startLoadingStatus = () => {
  if (!loadingStatusEl) return;
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
  if (!loadingStatusEl) return;
  loadingStatusEl.hidden = false;
  loadingStatusEl.classList.add('is-error');
  setLoadingMessage('Could not load activity feed. Please refresh');
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
  ]
    .some((fn) => typeof fn !== 'function')
) {
  throw new Error('activity-utils.js must be loaded before load-table.js');
}

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

const normalizeForKey = (value) => `${value ?? ''}`
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .trim();

const socialIconClass = (platform) => ({
  linkedin: 'fa-brands fa-linkedin',
  x: 'fa-brands fa-x-twitter',
  bluesky: 'fa-brands fa-bluesky',
  shared: 'fa-solid fa-share-nodes',
}[platform] || 'fa-solid fa-share-nodes');

const renderSocialLink = ({ url, platform, title }) =>
  `<a href="${url}" target="_blank" rel="noopener noreferrer" class="social-link social-link--${platform}" title="${title}" aria-label="${title}">
    <i class="${socialIconClass(platform)}" aria-hidden="true"></i>
  </a>`;

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
      pickFirst(row, ['EsriDevs Shared', 'EsriDevs shared']),
      pickFirst(row, ['Author', 'Authors']),
      pickFirst(row, ['Contributors', 'Contributor']),
      pickFirst(row, ['Channel']),
      pickFirst(row, ['Language', 'Languages']),
      pickFirst(row, ['Topics_Product', 'Technology', 'Technologies']),
      pickFirst(row, ['Category', 'Category / Content type', 'Content type']),
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
    existing.__socialLinks = mergeUniqueItems(existing.__socialLinks, socialLinks);

    if (!isTruthyCell(existing['Featured']) && isTruthyCell(row['Featured'])) {
      existing['Featured'] = row['Featured'];
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
  return ['true', 'yes', 'y', '1'].includes(normalized);
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
  return {
    technologies: uniqueColumnValues(dropdownRows, ['Technologies', 'Technology', 'Topics_Product']),
    categories:   uniqueColumnValues(dropdownRows, ['Category / Content type', 'Category', 'Content type']),
    channels:     uniqueColumnValues(dropdownRows, ['Channel']),
    authors:      uniqueColumnValues(dropdownRows, ['Author', 'Authors']),
    contributors: authorsFromSheet,
    languages:    uniqueColumnValues(dropdownRows, ['Languages', 'Language']),
  };
}

function processAndRender(activityRows, dropdownRows, authorsRows) {
  const sanitizedActivityRows = sanitizeActivityRows(activityRows);
  const dedupedActivityRows = dedupeActivityRows(sanitizedActivityRows);
  window.activityData = dedupedActivityRows;
  window.dropdownData = buildDropdownData(dropdownRows, authorsRows);
  renderTableRows(dedupedActivityRows);
  if (typeof window.onDataLoaded === 'function') {
    window.onDataLoaded();
  }
}

function refreshTableOnly(freshActivity) {
  const sanitizedActivityRows = sanitizeActivityRows(freshActivity);
  const dedupedActivityRows = dedupeActivityRows(sanitizedActivityRows);
  window.activityData = dedupedActivityRows;
  const tableBody = document.querySelector('#main-table tbody');
  if (tableBody) tableBody.innerHTML = '';
  renderTableRows(dedupedActivityRows);
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

function renderTableRows(rows) {
  if (!('content' in document.createElement('template'))) return;

  const tableBody = document.querySelector('#main-table tbody');
  const template = document.querySelector('#templateRow');
  if (!tableBody || !template) return;

  rows.forEach(e => {
    const clone = template.content.cloneNode(true);
    const row = clone.firstElementChild;
    const featured = isTruthyCell(e['Featured']);

    if (featured) row.classList.add('selected');

    const td = clone.querySelectorAll('td');
    const isFeatured = featured ? '⭐ ' : '';

    const date = pickFirst(e, ['Date']);
    const title = pickFirst(e, ['Title', 'Content title']);
    const contentLinks = Array.isArray(e.__contentLinks) ? e.__contentLinks : extractContentLinks(e);
    const primaryUrl = contentLinks[0]?.url || '';
    const author = pickFirst(e, ['Author', 'Authors']);
    const contributors = pickFirst(e, ['Authors', 'Contributors', 'Contributor']);
    const channel = pickFirst(e, ['Channel']);
    const language = pickFirst(e, ['Language', 'Languages']);
    const technology = pickFirst(e, ['Topics_Product', 'Technology', 'Technologies']);
    const category = pickFirst(e, ['Category', 'Category / Content type', 'Content type']);
    const socialLinks = Array.isArray(e.__socialLinks) ? e.__socialLinks : extractSocialLinks(e);

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

    if (!hasRenderableData) return;

    td[0].innerText = formatDate(date);
    row.setAttribute('data-date', date);

    const domainLinks = contentLinks
      .map((link) => `<a href="${link.url}" target="_blank" rel="noopener noreferrer" class="table-title-link small">${getDomainLabel(link.url)}</a>`)
      .join(', ');

    td[1].innerHTML = `
      <span>${isFeatured}${title}</span>
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
      td[5].innerHTML = `<div class="social-links">${socialLinks.map(renderSocialLink).join('')}</div>`;
    } else {
      const socialHelpTooltipHtml = `No social links available.<br>If you know this content was shared, <a href='https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit?usp=sharing' target='_blank' rel='noopener noreferrer'>add it via Add new activity</a> or contact <a href='mailto:developers@esri.com'>developers@esri.com</a>.`;
      td[5].innerHTML = `<span class="social-na" data-bs-toggle="tooltip" data-bs-html="true" data-bs-title="${socialHelpTooltipHtml}" aria-label="No social links available. Hover for details.">N/A <i class="fa-solid fa-circle-info social-na__icon" aria-hidden="true"></i></span>`;
    }

    td[6].innerText = technology;
    row.setAttribute('data-technologies', technology);

    td[7].innerText = category;
    row.setAttribute('data-categories', category);

    tableBody.appendChild(clone);
  });

  initSocialTooltips();
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

// If we have cached data, hide the loading spinner right away so users see no flash.
if (cachedData && loadingStatusEl) {
  loadingStatusEl.hidden = true;
} else {
  startLoadingStatus();
}

const dataFetchPromise = Promise.all([
  fetchJsonOrThrow(`https://opensheet.elk.sh/${SPREADSHEET_ID}/Activity`),
  fetchJsonOrThrow(`https://opensheet.elk.sh/${SPREADSHEET_ID}/Dropdowns`),
  fetchJsonOrThrow(`https://opensheet.elk.sh/${SPREADSHEET_ID}/Authors`),
]);

window.addEventListener('DOMContentLoaded', () => {
  document.querySelector('#update-toast-close')?.addEventListener('click', hideToast);

  if (cachedData) {
    // Render from cache immediately — all other scripts are now ready
    processAndRender(cachedData.activityRows, cachedData.dropdownRows, cachedData.authorsRows);
    showToast('Checking for updates\u2026', 'checking');

    dataFetchPromise
      .then(([freshActivity, freshDropdowns, freshAuthors]) => {
        saveDataCache(sanitizeActivityRows(freshActivity), freshDropdowns, freshAuthors);
        if (dataHasChanged(freshActivity, cachedData.activityRows)) {
          showToast('New data available \u2014 refreshing\u2026', 'updating');
          setTimeout(() => {
            refreshTableOnly(freshActivity);
            showToast('Activity feed updated', 'uptodate', 3000);
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
        processAndRender(activityRows, dropdownRows, authorsRows);
        stopLoadingStatus();
      })
      .catch(err => {
        console.error('Failed to load data:', err);
        showLoadingError();
      });
  }
});
