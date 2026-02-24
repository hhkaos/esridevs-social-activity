/**
 * charts.js — renders Chart.js charts in the Trends tab.
 *
 * Reads from:
 *   window.activityData  – full dataset loaded by load-table.js
 *   window.flags         – current filter state from apply-filters.js
 *
 * Exposes:
 *   window.renderCharts() – called after data loads and after filter changes
 */

// Brand-inspired palette
const PALETTE = [
  '#007AC2', '#F05C28', '#00A0D2', '#56A0D3',
  '#A9D3F5', '#FFB300', '#5CB85C', '#9B59B6',
  '#E74C3C', '#1ABC9C', '#95A5A6', '#E67E22',
];

let chartInstances = {};
let chartConfigs = {};
let expandedChartInstance = null;
let expandedChartId = '';
let chartModal = null;

function destroyAll() {
  Object.values(chartInstances).forEach(c => c?.destroy());
  chartInstances = {};
  chartConfigs = {};
}

function destroyExpandedChart() {
  expandedChartInstance?.destroy();
  expandedChartInstance = null;
}

function cloneChartConfig(config) {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(config);
    } catch (error) {
      // Some Chart.js internals/plugins include functions that structuredClone cannot copy.
    }
  }
  return cloneWithFunctions(config);
}

function cloneWithFunctions(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(cloneWithFunctions);

  const cloned = {};
  Object.keys(value).forEach((key) => {
    cloned[key] = cloneWithFunctions(value[key]);
  });
  return cloned;
}

function renderExpandedChart(chartId) {
  const sourceConfig = chartConfigs[chartId];
  const modalCanvas = document.getElementById('chart-modal-canvas');
  const modalTitle = document.getElementById('chart-modal-title');
  const sourceCard = document.querySelector(`.chart-card[data-chart-id="${chartId}"] .chart-title`);
  if (!sourceConfig || !modalCanvas) {
    console.warn('Expanded chart skipped: missing config or modal canvas', { chartId });
    return;
  }

  destroyExpandedChart();

  const config = cloneChartConfig(sourceConfig);
  config.options = {
    ...(config.options || {}),
    responsive: true,
    maintainAspectRatio: false,
  };

  const parentBox = modalCanvas.parentElement?.getBoundingClientRect();
  if (parentBox) {
    modalCanvas.width = Math.max(Math.floor(parentBox.width), 320);
    modalCanvas.height = Math.max(Math.floor(parentBox.height), 260);
  }

  try {
    expandedChartInstance = new Chart(modalCanvas, config);
  } catch (error) {
    console.error('Failed to render expanded chart', { chartId, error });
    return;
  }
  expandedChartId = chartId;
  if (modalTitle && sourceCard) modalTitle.textContent = sourceCard.textContent || 'Chart';
}

function openExpandedChart(chartId) {
  const modalEl = document.getElementById('chart-modal');
  if (!modalEl || !window.bootstrap?.Modal) return;

  if (!chartModal) {
    chartModal = new window.bootstrap.Modal(modalEl);
    modalEl.addEventListener('shown.bs.modal', () => {
      if (expandedChartId) renderExpandedChart(expandedChartId);
    });
    modalEl.addEventListener('hidden.bs.modal', () => {
      destroyExpandedChart();
      expandedChartId = '';
    });
  }

  expandedChartId = chartId;
  if (modalEl.classList.contains('show')) {
    renderExpandedChart(chartId);
    return;
  }
  chartModal.show();
}

function initializeChartCardExpansion() {
  const cards = document.querySelectorAll('.chart-card[data-chart-id]');
  cards.forEach((card) => {
    if (card.dataset.expandBound === '1') return;
    const chartId = card.getAttribute('data-chart-id');
    const openCard = () => {
      if (!chartId) return;
      openExpandedChart(chartId);
    };

    card.addEventListener('click', (event) => {
      if (event.target.closest('a, button')) return;
      openCard();
    });
    card.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      openCard();
    });
    card.dataset.expandBound = '1';
  });
}

/** Returns window.activityData filtered through the current flags state. */
function getFilteredData() {
  const data = window.activityData || [];
  const f = window.flags;
  if (!f) return data;
  const {
    channels = {},
    technologies = {},
    categories = {},
    authors = {},
    contributors = {},
    languages = {},
    dateRange = {},
  } = f;
  const fromDate = chartsParseISODate(dateRange.from);
  const toDate = chartsParseISODate(dateRange.to);
  return data.filter((row) => [
    [channels, row['Channel'], false],
    [technologies, row['Topics_Product'], false],
    [categories, row['Category'], false],
    [authors, row['Author'], false],
    [contributors, getContributorsCell(row), true],
    [languages, row['Language'], false],
  ].every(([map, val, splitValues]) => chartsPassesFilter(map, val, splitValues))
    && chartsIsDateInRange(row['Date'], fromDate, toDate));
}

function chartsParseISODate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!m) return null;
  const date = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (
    date.getUTCFullYear() !== +m[1] ||
    date.getUTCMonth() !== (+m[2] - 1) ||
    date.getUTCDate() !== +m[3]
  ) return null;
  return date;
}

function chartsParseRowDate(value) {
  if (!value) return null;
  const exactIso = chartsParseISODate(value);
  if (exactIso) return exactIso;
  const date = new Date(value);
  if (isNaN(date)) return null;
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

function chartsIsDateInRange(value, fromDate, toDate) {
  const rowDate = chartsParseRowDate(value);
  if (!rowDate) return true;
  if (fromDate && rowDate < fromDate) return false;
  if (toDate && rowDate > toDate) return false;
  return true;
}

/** Returns "YYYY-MM" for a date string, or null if unparseable. */
function toMonthKey(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Converts "YYYY-MM" to a short display label like "Jan '25". */
function monthKeyToLabel(key) {
  const [y, mo] = key.split('-');
  return new Date(+y, +mo - 1).toLocaleString('default', { month: 'short', year: '2-digit' });
}

/** Counts occurrences of each unique value for a given row key. */
function countByKey(data, key) {
  return data.reduce((acc, row) => {
    const val = row[key] || 'Unknown';
    acc[val] = (acc[val] || 0) + 1;
    return acc;
  }, {});
}

function splitMultiValueCell(value) {
  return `${value || ''}`
    .split(/[,;|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getContributorsCell(row) {
  return row['Authors'] || row['Contributors'] || row['Contributor'] || '';
}

function chartsPassesFilter(map, value, splitValues = false) {
  if (!value) return true;
  if (!splitValues) return map[value] !== 0;
  return splitMultiValueCell(value).some((item) => map[item] !== 0);
}

function countContributors(data) {
  const counts = {};
  data.forEach((row) => {
    const contributors = splitMultiValueCell(getContributorsCell(row));
    if (contributors.length === 0) {
      counts.Unknown = (counts.Unknown || 0) + 1;
      return;
    }
    contributors.forEach((name) => {
      counts[name] = (counts[name] || 0) + 1;
    });
  });
  return counts;
}

function countUniqueContributors(data) {
  const uniqueContributors = new Set();
  data.forEach((row) => {
    splitMultiValueCell(getContributorsCell(row)).forEach((name) => uniqueContributors.add(name));
  });
  return uniqueContributors.size;
}

function makeChart(id, config) {
  const ctx = document.getElementById(id);
  if (!ctx) return;
  chartConfigs[id] = cloneChartConfig(config);
  chartInstances[id] = new Chart(ctx, cloneChartConfig(config));
}

const baseOptions = {
  responsive: true,
  maintainAspectRatio: false,
};

// ── Public API ────────────────────────────────────────────────────────────────

window.renderCharts = function () {
  if (!window.activityData?.length) return;

  const data = getFilteredData();
  destroyAll();

  // Shared month axis (sorted chronologically)
  const monthMap = {};
  data.forEach(row => {
    const m = toMonthKey(row['Date']);
    if (m) monthMap[m] = (monthMap[m] || 0) + 1;
  });
  const sortedMonths = Object.keys(monthMap).sort();
  const monthLabels  = sortedMonths.map(monthKeyToLabel);

  // ── 1. Channel breakdown over time (stacked bar) ──────────────────────────
  const allChannels = [...new Set(data.map((row) => row['Channel'] || 'Unknown'))];
  const byMonthChannel = {};
  data.forEach((row) => {
    const m = toMonthKey(row['Date']);
    if (!m) return;
    if (!byMonthChannel[m]) byMonthChannel[m] = {};
    const channel = row['Channel'] || 'Unknown';
    byMonthChannel[m][channel] = (byMonthChannel[m][channel] || 0) + 1;
  });

  makeChart('chart-overtime', {
    type: 'bar',
    data: {
      labels: monthLabels,
      datasets: allChannels.map((channel, i) => ({
        label: channel,
        data: sortedMonths.map((m) => byMonthChannel[m]?.[channel] || 0),
        backgroundColor: PALETTE[i % PALETTE.length],
        borderRadius: 2,
      })),
    },
    options: {
      ...baseOptions,
      plugins: { legend: { position: 'bottom' } },
      scales: {
        x: { stacked: true },
        y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } },
      },
    },
  });

  // ── 2. Author breakdown over time (stacked bar) ────────────────────────────
  const allAuthors = [...new Set(data.map(r => r['Author'] || 'Unknown'))];
  const byMonthAuthor = {};
  data.forEach(row => {
    const m = toMonthKey(row['Date']);
    if (!m) return;
    if (!byMonthAuthor[m]) byMonthAuthor[m] = {};
    const a = row['Author'] || 'Unknown';
    byMonthAuthor[m][a] = (byMonthAuthor[m][a] || 0) + 1;
  });

  makeChart('chart-author', {
    type: 'bar',
    data: {
      labels: monthLabels,
      datasets: allAuthors.map((author, i) => ({
        label: author,
        data: sortedMonths.map(m => byMonthAuthor[m]?.[author] || 0),
        backgroundColor: PALETTE[i % PALETTE.length],
        borderRadius: 2,
      })),
    },
    options: {
      ...baseOptions,
      scales: {
        x: { stacked: true },
        y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } },
      },
      plugins: { legend: { position: 'bottom' } },
    },
  });

  // ── 3. Content type doughnut ───────────────────────────────────────────────
  const typeEntries = Object.entries(countByKey(data, 'Category')).sort((a, b) => b[1] - a[1]);
  makeChart('chart-type', {
    type: 'doughnut',
    data: {
      labels: typeEntries.map(([k]) => k),
      datasets: [{ data: typeEntries.map(([, v]) => v), backgroundColor: PALETTE }],
    },
    options: { ...baseOptions, plugins: { legend: { position: 'bottom' } } },
  });

  // ── 4. Channel doughnut ────────────────────────────────────────────────────
  const channelEntries = Object.entries(countByKey(data, 'Channel')).sort((a, b) => b[1] - a[1]);
  makeChart('chart-channel', {
    type: 'doughnut',
    data: {
      labels: channelEntries.map(([k]) => k),
      datasets: [{ data: channelEntries.map(([, v]) => v), backgroundColor: PALETTE }],
    },
    options: { ...baseOptions, plugins: { legend: { position: 'bottom' } } },
  });

  // ── 5. Top topics / technologies (stacked by author) ─────────────────────
  const topicEntries = Object.entries(countByKey(data, 'Topics_Product'))
    .sort((a, b) => b[1] - a[1]);
  const topicLabels = topicEntries.map(([topic]) => topic);
  const authorLabels = [...new Set(data.map((row) => row['Author'] || 'Unknown'))];
  const topicAuthorCounts = {};
  topicLabels.forEach((topic) => {
    topicAuthorCounts[topic] = {};
    authorLabels.forEach((author) => {
      topicAuthorCounts[topic][author] = 0;
    });
  });
  data.forEach((row) => {
    const topic = row['Topics_Product'] || 'Unknown';
    if (!topicAuthorCounts[topic]) return;
    const author = row['Author'] || 'Unknown';
    topicAuthorCounts[topic][author] = (topicAuthorCounts[topic][author] || 0) + 1;
  });

  makeChart('chart-topic', {
    type: 'bar',
    data: {
      labels: topicLabels,
      datasets: authorLabels.map((author, i) => ({
        label: author,
        data: topicLabels.map((topic) => topicAuthorCounts[topic]?.[author] || 0),
        backgroundColor: PALETTE[i % PALETTE.length],
      })),
    },
    options: {
      ...baseOptions,
      indexAxis: 'y',
      scales: {
        x: {
          stacked: true,
          beginAtZero: true,
          ticks: { precision: 0 },
        },
        y: {
          stacked: true,
        },
      },
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            label: (context) => `${context.dataset.label}: ${context.parsed.x || 0}`,
          },
        },
      },
    },
  });

  // ── 6. Language doughnut ───────────────────────────────────────────────────
  const langEntries = Object.entries(countByKey(data, 'Language')).sort((a, b) => b[1] - a[1]);
  makeChart('chart-language', {
    type: 'doughnut',
    data: {
      labels: langEntries.map(([k]) => k),
      datasets: [{ data: langEntries.map(([, v]) => v), backgroundColor: PALETTE }],
    },
    options: { ...baseOptions, plugins: { legend: { position: 'bottom' } } },
  });

  // ── 7. Contributors doughnut ───────────────────────────────────────────────
  const contributorEntries = Object.entries(countContributors(data))
    .sort((a, b) => b[1] - a[1]);
  const contributorsTitleEl = document.querySelector('#chart-contributors-card .chart-title');
  if (contributorsTitleEl) {
    contributorsTitleEl.textContent = `Contributors (${countUniqueContributors(data)})`;
  }
  makeChart('chart-contributors', {
    type: 'doughnut',
    data: {
      labels: contributorEntries.map(([k]) => k),
      datasets: [{ data: contributorEntries.map(([, v]) => v), backgroundColor: PALETTE }],
    },
    options: { ...baseOptions, plugins: { legend: { position: 'bottom' } } },
  });

  if (expandedChartId) renderExpandedChart(expandedChartId);
};

// Re-render whenever the Trends tab becomes active.
const handleTabActivation = () => {
  const trendsTab = document.querySelector('#tab-trends');
  if (trendsTab?.classList.contains('active') && window.activityData?.length) {
    window.renderCharts();
  }
};

document.querySelector('#tab-trends-trigger')?.addEventListener('shown.bs.tab', handleTabActivation);
initializeChartCardExpansion();
