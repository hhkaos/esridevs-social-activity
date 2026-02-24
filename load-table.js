const SPREADSHEET_ID = '1oKkHCNbOUpfERu1xC4ePU2XwDSvalEfE0YmTN39cyNg';

window.activityData = [];
window.dropdownData = {};

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

const fetchJsonOrThrow = (url) =>
  fetch(url).then((response) => {
    if (!response.ok) throw new Error(`Request failed: ${response.status} ${response.statusText}`);
    return response.json();
  });

const hasText = (value) => `${value ?? ''}`.trim() !== '';

const pickFirst = (row, keys) => {
  for (const key of keys) {
    if (hasText(row?.[key])) return `${row[key]}`.trim();
  }
  return '';
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

startLoadingStatus();

Promise.all([
  fetchJsonOrThrow(`https://opensheet.elk.sh/${SPREADSHEET_ID}/Activity`),
  fetchJsonOrThrow(`https://opensheet.elk.sh/${SPREADSHEET_ID}/Dropdowns`),
  fetchJsonOrThrow(`https://opensheet.elk.sh/${SPREADSHEET_ID}/Authors`)
]).then(([activityRows, dropdownRows, authorsRows]) => {
  window.activityData = activityRows;

  // Build dropdown options from sheet columns while supporting alternate header names.
  // Authors sheet can expose different headers; use the first non-empty cell from each row.
  const authorsFromSheet = [...new Set(
    authorsRows
      .map((row) => Object.values(row).map(v => `${v ?? ''}`.trim()).find(Boolean))
      .filter(Boolean)
  )];
  window.dropdownData = {
    technologies: uniqueColumnValues(dropdownRows, ['Technologies', 'Technology', 'Topics_Product']),
    categories:   uniqueColumnValues(dropdownRows, ['Category / Content type', 'Category', 'Content type']),
    channels:     uniqueColumnValues(dropdownRows, ['Channel']),
    authors:      uniqueColumnValues(dropdownRows, ['Author', 'Authors']),
    contributors: authorsFromSheet,
    languages:    uniqueColumnValues(dropdownRows, ['Languages', 'Language'])
  };

  renderTableRows(activityRows);

  if (typeof window.onDataLoaded === 'function') {
    window.onDataLoaded();
  }
  stopLoadingStatus();
}).catch(err => {
  console.error('Failed to load data:', err);
  showLoadingError();
});

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
    const url = pickFirst(e, ['URL', 'Url', 'Link']);
    const author = pickFirst(e, ['Author', 'Authors']);
    const contributors = pickFirst(e, ['Authors', 'Contributors', 'Contributor']);
    const channel = pickFirst(e, ['Channel']);
    const language = pickFirst(e, ['Language', 'Languages']);
    const linkedin = pickFirst(e, ['Linkedin', 'LinkedIn']);
    const xPost = pickFirst(e, ['X/Twitter', 'X', 'Twitter']);
    const technology = pickFirst(e, ['Topics_Product', 'Technology', 'Technologies']);
    const category = pickFirst(e, ['Category', 'Category / Content type', 'Content type']);

    td[0].innerText = formatDate(date);
    row.setAttribute('data-date', date);

    if (url && url.toLowerCase() !== 'n/a') {
      td[1].innerHTML = `<a href="${url}" target="_blank" class="table-title-link">${isFeatured}${title}</a>`;
    } else {
      td[1].innerHTML = `${isFeatured}${title}`;
    }

    td[2].innerText = author;
    row.setAttribute('data-authors', author);
    row.setAttribute('data-contributors', contributors);

    td[3].innerText = channel;
    row.setAttribute('data-channels', channel);

    td[4].innerText = language;
    row.setAttribute('data-languages', language);

    if (linkedin && linkedin.toLowerCase() !== 'n/a') {
      td[5].innerHTML = `<a href="${linkedin}" target="_blank" class="social-link" title="Like or repost on LinkedIn">🔁</a>`;
    }
    if (xPost && xPost.toLowerCase() !== 'n/a') {
      td[6].innerHTML = `<a href="${xPost}" target="_blank" class="social-link" title="Like or repost on X">🔁</a>`;
    }

    td[7].innerText = technology;
    row.setAttribute('data-technologies', technology);

    td[8].innerText = category;
    row.setAttribute('data-categories', category);

    tableBody.appendChild(clone); // Single append - avoids duplicate rows
  });
}

function formatDate(dateString) {
  const date = parseDateInput(dateString);
  if (!date) return dateString || '';
  return TABLE_DATE_FORMATTER.format(date);
}
