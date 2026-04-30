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
let sparklineInstances = [];
let expandedChartInstance = null;
let expandedChartId = '';
let chartModal = null;
let drillState = {};
let renderingFromDrill = false;

const DRILLABLE_CHART_IDS = ['chart-topic', 'chart-contributors'];

function setDrillState(chartId, state) {
  if (!chartId) return;
  if (state === null || state === undefined) {
    delete drillState[chartId];
  } else {
    drillState[chartId] = state;
  }
  renderingFromDrill = true;
  try {
    if (typeof window.renderCharts === 'function') window.renderCharts();
  } finally {
    renderingFromDrill = false;
  }
}

function isChartDrilled(chartId) {
  return drillState[chartId]?.mode === 'others';
}

function resetDrillStateForChartsBeingRecomputed() {
  if (renderingFromDrill) return;
  drillState = {};
}

function updateDrillBackButton(chartId, isDrilled, label) {
  if (typeof document?.querySelector !== 'function') return;
  const card = document.querySelector(`.chart-card[data-chart-id="${chartId}"]`);
  if (!card || typeof card.querySelector !== 'function') return;
  let backBtn = card.querySelector('.chart-drill-back');
  if (isDrilled) {
    if (!backBtn) {
      if (typeof document.createElement !== 'function') return;
      backBtn = document.createElement('button');
      backBtn.type = 'button';
      backBtn.className = 'chart-drill-back';
      backBtn.addEventListener?.('click', (event) => {
        event.stopPropagation?.();
        setDrillState(chartId, null);
      });
      const title = card.querySelector('.chart-title');
      if (title?.parentNode?.insertBefore) {
        title.parentNode.insertBefore(backBtn, title);
      } else if (typeof card.appendChild === 'function') {
        card.appendChild(backBtn);
      }
    }
    backBtn.textContent = label || '← Back';
    backBtn.hidden = false;
  } else if (backBtn) {
    backBtn.remove?.();
  }
}

const COMPARE_MODE_NONE = 'none';
const COMPARE_MODE_PREVIOUS_PERIOD = 'previous-period';
const COMPARE_MODE_VALUES = new Set([COMPARE_MODE_NONE, COMPARE_MODE_PREVIOUS_PERIOD]);
const COMPARE_MODE_STORAGE_KEY = 'esridevs_compare_mode_v1';
const TOP_N_LIMIT = 10;
const PREVIOUS_LINE_COLOR = '#5a6f96';

const DELTA_BADGE_COLORS = {
  up: '#1f7a3a',
  down: '#b03021',
  flat: '#5f6f96',
  new: '#007AC2',
  gone: '#b03021',
};

const deltaBadgePlugin = {
  id: 'deltaBadge',
  afterDatasetsDraw(chart, _args, opts) {
    if (!opts || !opts.enabled) return;
    const totals = opts.totals;
    const previousTotals = opts.previousTotals;
    if (!Array.isArray(totals) || !Array.isArray(previousTotals)) return;
    const { ctx, scales } = chart;
    const isHorizontal = chart.options?.indexAxis === 'y';
    if (!isHorizontal || !scales?.x || !scales?.y) return;
    const labels = chart.data?.labels || [];
    const computeDelta = window.activityUtils?.computeDelta;
    if (typeof computeDelta !== 'function') return;

    ctx.save();
    ctx.font = '600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    labels.forEach((_label, idx) => {
      const currentTotal = totals[idx] || 0;
      const previousValue = previousTotals[idx] === undefined ? null : previousTotals[idx];
      const delta = computeDelta(currentTotal, previousValue);
      if (delta.status === 'na') return;
      ctx.fillStyle = DELTA_BADGE_COLORS[delta.status] || '#5f6f96';
      const x = scales.x.getPixelForValue(currentTotal) + 6;
      const y = scales.y.getPixelForValue(idx);
      ctx.fillText(delta.label, x, y);
    });

    ctx.restore();
  },
};

if (typeof Chart !== 'undefined' && Chart?.register) {
  try {
    Chart.register(deltaBadgePlugin);
  } catch (error) {
    console.warn('deltaBadge plugin registration skipped', error);
  }
}

function getCompareMode() {
  try {
    const stored = window.localStorage?.getItem(COMPARE_MODE_STORAGE_KEY);
    return COMPARE_MODE_VALUES.has(stored) ? stored : COMPARE_MODE_NONE;
  } catch {
    return COMPARE_MODE_NONE;
  }
}

function setCompareMode(mode) {
  const next = COMPARE_MODE_VALUES.has(mode) ? mode : COMPARE_MODE_NONE;
  try {
    if (next === COMPARE_MODE_NONE) {
      window.localStorage?.removeItem(COMPARE_MODE_STORAGE_KEY);
    } else {
      window.localStorage?.setItem(COMPARE_MODE_STORAGE_KEY, next);
    }
  } catch {
    // Storage unavailable — silently degrade to in-memory default.
  }
  return next;
}

const chartPickFirst = typeof window.activityUtils?.pickFirst === 'function'
  ? window.activityUtils.pickFirst
  : (row, keys) => {
    for (const key of keys) {
      const value = `${row?.[key] ?? ''}`.trim();
      if (value) return value;
    }
    return '';
  };

const CHART_FIELD_KEYS = {
  date: window.activityUtils?.OPEN_SHEET_FIELD_ALIASES?.date || ['Date'],
  publisher: window.activityUtils?.OPEN_SHEET_FIELD_ALIASES?.publisher || ['Publisher', 'Author', 'Authors'],
  peopleInvolved: window.activityUtils?.OPEN_SHEET_FIELD_ALIASES?.peopleInvolved || ['People involved', 'People Involved', 'People_involved', 'Contributors', 'Contributor', 'Authors'],
  channelOwner: window.activityUtils?.OPEN_SHEET_FIELD_ALIASES?.channelOwner || ['Channel owner', 'Channel Owner', 'Channel_owner', 'ChannelOwner', 'Channel'],
  language: window.activityUtils?.OPEN_SHEET_FIELD_ALIASES?.language || ['Language', 'Languages'],
  technology: window.activityUtils?.OPEN_SHEET_FIELD_ALIASES?.technology || ['Topics_Product', 'Technology', 'Technologies'],
  category: window.activityUtils?.OPEN_SHEET_FIELD_ALIASES?.category || ['Category', 'Category / Content type', 'Content type'],
};

function destroyAll() {
  Object.values(chartInstances).forEach(c => c?.destroy());
  chartInstances = {};
  chartConfigs = {};
  destroySparklines();
}

function destroySparklines() {
  sparklineInstances.forEach((c) => c?.destroy());
  sparklineInstances = [];
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

/**
 * Returns the previous-period equivalent of the current dateRange, or null when
 * no comparison is possible (no range, invalid range, or compare mode off).
 */
function getPreviousRange(flagsLike = window.flags) {
  if (typeof window.activityUtils?.computePreviousRange !== 'function') return null;
  const dateRange = flagsLike?.dateRange;
  if (!dateRange?.from || !dateRange?.to) return null;
  return window.activityUtils.computePreviousRange(dateRange);
}

/**
 * Returns window.activityData filtered with the same flags but shifted to the
 * previous period (same length, immediately before current range). Returns []
 * when comparison is not applicable.
 */
function getPreviousFilteredData() {
  const data = window.activityData || [];
  const f = window.flags;
  if (!f) return [];
  const previousRange = getPreviousRange(f);
  if (!previousRange) return [];
  const previousFlags = { ...f, dateRange: previousRange };
  if (typeof window.activityUtils?.filterActivityRows === 'function') {
    return window.activityUtils.filterActivityRows(data, previousFlags);
  }
  return [];
}

/** Returns window.activityData filtered through the current flags state. */
function getFilteredData() {
  const data = window.activityData || [];
  const f = window.flags;
  if (!f) return data;
  if (typeof window.activityUtils?.filterActivityRows === 'function') {
    return window.activityUtils.filterActivityRows(data, f);
  }
  const {
    channels = {},
    technologies = {},
    categories = {},
    authors = {},
    contributors = {},
    languages = {},
    featuredOnly = false,
    dateRange = {},
  } = f;
  const fromDate = chartsParseISODate(dateRange.from);
  const toDate = chartsParseISODate(dateRange.to);
  return data.filter((row) => (!featuredOnly || ['true', 'yes', 'y', '1', 'x'].includes(`${row?.Featured ?? ''}`.trim().toLowerCase()))
    && [
    [channels, chartPickFirst(row, CHART_FIELD_KEYS.channelOwner), false],
    [technologies, chartPickFirst(row, CHART_FIELD_KEYS.technology), true],
    [categories, chartPickFirst(row, CHART_FIELD_KEYS.category), false],
    [authors, chartPickFirst(row, CHART_FIELD_KEYS.publisher), false],
    [contributors, getContributorsCell(row), true],
    [languages, chartPickFirst(row, CHART_FIELD_KEYS.language), false],
  ].every(([map, val, splitValues]) => chartsPassesFilter(map, val, splitValues))
    && chartsIsDateInRange(chartPickFirst(row, CHART_FIELD_KEYS.date), fromDate, toDate));
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
function countByKey(data, getter, keys) {
  return data.reduce((acc, row) => {
    const val = getter(row, keys) || 'Unknown';
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
  return chartPickFirst(row, CHART_FIELD_KEYS.peopleInvolved);
}

function getTechnologyTopics(row) {
  const topics = splitMultiValueCell(chartPickFirst(row, CHART_FIELD_KEYS.technology));
  return topics.length ? topics : ['Unknown'];
}

function chartsPassesFilter(map, value, splitValues = false) {
  if (!value) return true;
  if (!splitValues) return map[value] !== 0;
  return splitMultiValueCell(value).some((item) => map[item] !== 0);
}

function countTechnologyTopics(data) {
  const counts = {};
  data.forEach((row) => {
    getTechnologyTopics(row).forEach((topic) => {
      counts[topic] = (counts[topic] || 0) + 1;
    });
  });
  return counts;
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

/**
 * Aligns previous-period monthly totals to the current period's month axis
 * by index (chronological). Returns `{ totals, monthKeys }` of length
 * `currentMonthCount`. `totals` pads missing slots with 0 and `monthKeys`
 * pads with null so callers can render labels per index.
 */
function buildPreviousMonthlyTotals(previousData, currentMonthCount) {
  if (!Array.isArray(previousData) || previousData.length === 0) return null;
  if (!currentMonthCount || currentMonthCount < 1) return null;
  const prevMonthMap = {};
  previousData.forEach((row) => {
    const m = toMonthKey(chartPickFirst(row, CHART_FIELD_KEYS.date));
    if (m) prevMonthMap[m] = (prevMonthMap[m] || 0) + 1;
  });
  const sortedPrev = Object.keys(prevMonthMap).sort();
  const tail = sortedPrev.slice(-currentMonthCount);
  const padCount = Math.max(0, currentMonthCount - tail.length);
  const totals = new Array(padCount).fill(0);
  const monthKeys = new Array(padCount).fill(null);
  tail.forEach((m) => {
    totals.push(prevMonthMap[m]);
    monthKeys.push(m);
  });
  return { totals, monthKeys };
}

/**
 * Groups a sorted-desc list of [key, total] entries into top-N plus a single
 * "Others (count)" bucket. Also returns the sub-dimension counts merged for
 * the Others bucket so stacked bars stay accurate.
 */
function applyTopNWithOthers(orderedEntries, subDimMap, topN = TOP_N_LIMIT) {
  if (orderedEntries.length <= topN) {
    return {
      keys: orderedEntries.map(([k]) => k),
      totals: Object.fromEntries(orderedEntries),
      subDimMap: subDimMap || {},
      othersGroupSize: 0,
      othersKey: null,
    };
  }
  const top = orderedEntries.slice(0, topN);
  const tail = orderedEntries.slice(topN);
  const othersKey = `Others (${tail.length})`;
  const newSubDim = {};
  Object.entries(subDimMap || {}).forEach(([key, sub]) => {
    if (top.find(([tk]) => tk === key)) {
      newSubDim[key] = { ...sub };
    }
  });
  const othersSubDim = {};
  tail.forEach(([k]) => {
    Object.entries(subDimMap?.[k] || {}).forEach(([sub, count]) => {
      othersSubDim[sub] = (othersSubDim[sub] || 0) + count;
    });
  });
  newSubDim[othersKey] = othersSubDim;
  const newTotals = Object.fromEntries(top);
  newTotals[othersKey] = tail.reduce((s, [, v]) => s + v, 0);
  return {
    keys: [...top.map(([k]) => k), othersKey],
    totals: newTotals,
    subDimMap: newSubDim,
    othersGroupSize: tail.length,
    othersKey,
  };
}

function countUniqueChannels(data) {
  const set = new Set();
  data.forEach((row) => {
    const value = chartPickFirst(row, CHART_FIELD_KEYS.channelOwner);
    if (value) set.add(value);
  });
  return set.size;
}

function countUniqueTopics(data) {
  const set = new Set();
  data.forEach((row) => {
    splitMultiValueCell(chartPickFirst(row, CHART_FIELD_KEYS.technology)).forEach((topic) => {
      if (topic) set.add(topic);
    });
  });
  return set.size;
}

const KPI_DEFINITIONS = [
  {
    id: 'posts',
    label: 'Posts',
    compute: (data) => data.length,
    bucketize: (rows) => rows.length,
  },
  {
    id: 'people',
    label: 'People involved',
    compute: (data) => countUniqueContributors(data),
    bucketize: (rows) => {
      const set = new Set();
      rows.forEach((row) => splitMultiValueCell(getContributorsCell(row)).forEach((n) => n && set.add(n)));
      return set.size;
    },
  },
  {
    id: 'channels',
    label: 'Active channels',
    compute: (data) => countUniqueChannels(data),
    bucketize: (rows) => {
      const set = new Set();
      rows.forEach((row) => {
        const v = chartPickFirst(row, CHART_FIELD_KEYS.channelOwner);
        if (v) set.add(v);
      });
      return set.size;
    },
  },
  {
    id: 'topics',
    label: 'Topics covered',
    compute: (data) => countUniqueTopics(data),
    bucketize: (rows) => {
      const set = new Set();
      rows.forEach((row) => {
        splitMultiValueCell(chartPickFirst(row, CHART_FIELD_KEYS.technology)).forEach((t) => t && set.add(t));
      });
      return set.size;
    },
  },
];

const KPI_BUCKET_COUNT = 12;

function getRangeBoundsForBuckets(data) {
  const f = window.flags;
  const fromIso = f?.dateRange?.from || '';
  const toIso = f?.dateRange?.to || '';
  let fromDate = chartsParseISODate(fromIso);
  let toDate = chartsParseISODate(toIso);

  if (!fromDate || !toDate) {
    let minMs = Infinity;
    let maxMs = -Infinity;
    data.forEach((row) => {
      const d = chartsParseRowDate(chartPickFirst(row, CHART_FIELD_KEYS.date));
      if (!d) return;
      const ms = d.getTime();
      if (ms < minMs) minMs = ms;
      if (ms > maxMs) maxMs = ms;
    });
    if (!Number.isFinite(minMs) || !Number.isFinite(maxMs)) return null;
    fromDate = new Date(minMs);
    toDate = new Date(maxMs);
  }

  if (fromDate > toDate) return null;
  return { fromDate, toDate };
}

function buildSparklineSeries(data, bucketize) {
  const bounds = getRangeBoundsForBuckets(data);
  if (!bounds) return [];
  const dayMs = 24 * 60 * 60 * 1000;
  const totalDays = Math.round((bounds.toDate.getTime() - bounds.fromDate.getTime()) / dayMs) + 1;
  const bucketCount = Math.max(1, Math.min(KPI_BUCKET_COUNT, totalDays));
  const bucketDays = totalDays / bucketCount;

  const buckets = Array.from({ length: bucketCount }, () => []);
  data.forEach((row) => {
    const d = chartsParseRowDate(chartPickFirst(row, CHART_FIELD_KEYS.date));
    if (!d) return;
    if (d < bounds.fromDate || d > bounds.toDate) return;
    const offsetDays = Math.round((d.getTime() - bounds.fromDate.getTime()) / dayMs);
    let idx = Math.floor(offsetDays / bucketDays);
    if (idx < 0) idx = 0;
    if (idx >= bucketCount) idx = bucketCount - 1;
    buckets[idx].push(row);
  });

  return buckets.map((rows) => bucketize(rows));
}

function renderKpiCards(currentData, previousData, compareMode) {
  const container = document.getElementById('insights-kpis');
  if (!container || typeof container.appendChild !== 'function' || typeof document.createElement !== 'function') return;

  container.innerHTML = '';
  container.hidden = false;

  const showCompare = compareMode === COMPARE_MODE_PREVIOUS_PERIOD;
  const previousRange = showCompare ? getPreviousRange() : null;

  KPI_DEFINITIONS.forEach((kpi) => {
    const value = kpi.compute(currentData);
    const card = document.createElement('div');
    card.className = 'insights-kpi';
    card.dataset.kpiId = kpi.id;

    const label = document.createElement('p');
    label.className = 'insights-kpi__label';
    label.textContent = kpi.label;
    card.appendChild(label);

    const valueEl = document.createElement('div');
    valueEl.className = 'insights-kpi__value';
    valueEl.textContent = value.toLocaleString();
    card.appendChild(valueEl);

    if (showCompare) {
      const previousValue = previousRange ? kpi.compute(previousData) : null;
      const delta = window.activityUtils?.computeDelta?.(value, previousValue) || { status: 'na', label: '—' };
      const deltaEl = document.createElement('div');
      deltaEl.className = `insights-kpi__delta insights-kpi__delta--${delta.status}`;
      const arrow = delta.status === 'up' ? '▲'
        : delta.status === 'down' || delta.status === 'gone' ? '▼'
        : delta.status === 'flat' ? '→'
        : '';
      deltaEl.textContent = `${arrow ? `${arrow} ` : ''}${delta.label} vs previous`;
      deltaEl.setAttribute('title', previousRange
        ? `Previous period: ${previousRange.from} to ${previousRange.to}`
        : 'No comparable previous period in the dataset');
      card.appendChild(deltaEl);

      const previousEl = document.createElement('div');
      previousEl.className = 'insights-kpi__previous';
      const previousText = previousRange && typeof previousValue === 'number'
        ? previousValue.toLocaleString()
        : '—';
      previousEl.textContent = `Previous: ${previousText}`;
      previousEl.setAttribute('title', previousRange
        ? `Previous period: ${previousRange.from} to ${previousRange.to}`
        : 'No comparable previous period in the dataset');
      card.appendChild(previousEl);
    }

    const sparkWrap = document.createElement('div');
    sparkWrap.className = 'insights-kpi__sparkline';
    const sparkCanvas = document.createElement('canvas');
    sparkCanvas.setAttribute('aria-hidden', 'true');
    sparkWrap.appendChild(sparkCanvas);
    card.appendChild(sparkWrap);

    container.appendChild(card);

    const series = buildSparklineSeries(currentData, kpi.bucketize);
    if (series.length > 0) {
      try {
        const sparkChart = new Chart(sparkCanvas, {
          type: 'line',
          data: {
            labels: series.map((_, i) => i),
            datasets: [{
              data: series,
              borderColor: '#007AC2',
              backgroundColor: 'rgba(0, 122, 194, 0.15)',
              fill: true,
              tension: 0.3,
              pointRadius: 0,
              borderWidth: 1.5,
            }],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            scales: {
              x: { display: false },
              y: { display: false, beginAtZero: true },
            },
          },
        });
        sparklineInstances.push(sparkChart);
      } catch (error) {
        console.warn('Sparkline render skipped', { kpi: kpi.id, error });
      }
    }
  });
}

const baseOptions = {
  responsive: true,
  maintainAspectRatio: false,
};

// ── Public API ────────────────────────────────────────────────────────────────

window.renderCharts = function () {
  if (!window.activityData?.length) return;

  resetDrillStateForChartsBeingRecomputed();
  const data = getFilteredData();
  destroyAll();

  const compareMode = getCompareMode();
  const previousData = compareMode === COMPARE_MODE_PREVIOUS_PERIOD
    ? getPreviousFilteredData()
    : [];
  renderKpiCards(data, previousData, compareMode);

  // Shared month axis (sorted chronologically)
  const monthMap = {};
  data.forEach(row => {
    const m = toMonthKey(chartPickFirst(row, CHART_FIELD_KEYS.date));
    if (m) monthMap[m] = (monthMap[m] || 0) + 1;
  });
  const sortedMonths = Object.keys(monthMap).sort();
  const monthLabels  = sortedMonths.map(monthKeyToLabel);

  const showCompare = compareMode === COMPARE_MODE_PREVIOUS_PERIOD;
  const previousMonthly = showCompare
    ? buildPreviousMonthlyTotals(previousData, sortedMonths.length)
    : null;
  const currentMonthlyTotals = sortedMonths.map((m) => monthMap[m] || 0);
  const previousMonthLabels = previousMonthly
    ? previousMonthly.monthKeys.map((k) => (k ? monthKeyToLabel(k) : null))
    : null;
  const buildPreviousLineDataset = (label = 'Previous period (total)') => ({
    type: 'line',
    label,
    data: previousMonthly.totals,
    borderColor: PREVIOUS_LINE_COLOR,
    borderDash: [5, 4],
    borderWidth: 2,
    backgroundColor: 'transparent',
    pointRadius: 3,
    pointBackgroundColor: PREVIOUS_LINE_COLOR,
    fill: false,
    order: 0,
    previousMeta: {
      currentMonthLabels: monthLabels,
      currentMonthlyTotals,
      previousMonthLabels,
    },
  });
  const buildPreviousLineTooltipCallbacks = () => ({
    title: (items) => {
      const item = items?.[0];
      const meta = item?.dataset?.previousMeta;
      if (meta) {
        const i = item.dataIndex;
        const prev = meta.previousMonthLabels?.[i];
        const curr = meta.currentMonthLabels?.[i] ?? item.label ?? '';
        return prev ? `${prev} → ${curr}` : `${curr} (no previous)`;
      }
      return item?.label ?? '';
    },
    label: (context) => {
      const meta = context.dataset?.previousMeta;
      if (!meta) {
        const value = context.parsed?.y ?? 0;
        return `${context.dataset.label}: ${value}`;
      }
      const i = context.dataIndex;
      const prevValue = context.parsed?.y ?? 0;
      const currValue = meta.currentMonthlyTotals?.[i] ?? 0;
      const computeDelta = window.activityUtils?.computeDelta;
      const delta = typeof computeDelta === 'function'
        ? computeDelta(currValue, prevValue)
        : { status: 'na', label: '—' };
      const arrow = delta.status === 'up' ? ' ▲'
        : delta.status === 'down' || delta.status === 'gone' ? ' ▼'
        : delta.status === 'flat' ? ' →'
        : '';
      return [
        `Previous: ${prevValue}`,
        `Current: ${currValue}`,
        `Δ: ${delta.label}${arrow}`,
      ];
    },
  });

  // ── 1. Channel breakdown over time (stacked bar) ──────────────────────────
  const allChannels = [...new Set(data.map((row) => chartPickFirst(row, CHART_FIELD_KEYS.channelOwner) || 'Unknown'))];
  const byMonthChannel = {};
  data.forEach((row) => {
    const m = toMonthKey(chartPickFirst(row, CHART_FIELD_KEYS.date));
    if (!m) return;
    if (!byMonthChannel[m]) byMonthChannel[m] = {};
    const channel = chartPickFirst(row, CHART_FIELD_KEYS.channelOwner) || 'Unknown';
    byMonthChannel[m][channel] = (byMonthChannel[m][channel] || 0) + 1;
  });

  const overtimeDatasets = allChannels.map((channel, i) => ({
    label: channel,
    data: sortedMonths.map((m) => byMonthChannel[m]?.[channel] || 0),
    backgroundColor: PALETTE[i % PALETTE.length],
    borderRadius: 2,
    stack: 'current',
  }));
  if (previousMonthly) overtimeDatasets.push(buildPreviousLineDataset());

  makeChart('chart-overtime', {
    type: 'bar',
    data: {
      labels: monthLabels,
      datasets: overtimeDatasets,
    },
    options: {
      ...baseOptions,
      plugins: {
        legend: { position: 'bottom' },
        tooltip: { callbacks: buildPreviousLineTooltipCallbacks() },
      },
      scales: {
        x: { stacked: true },
        y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } },
      },
    },
  });

  // ── 2. Author breakdown over time (stacked bar) ────────────────────────────
  const allAuthors = [...new Set(data.map((row) => chartPickFirst(row, CHART_FIELD_KEYS.publisher) || 'Unknown'))];
  const byMonthAuthor = {};
  data.forEach((row) => {
    const m = toMonthKey(chartPickFirst(row, CHART_FIELD_KEYS.date));
    if (!m) return;
    if (!byMonthAuthor[m]) byMonthAuthor[m] = {};
    const a = chartPickFirst(row, CHART_FIELD_KEYS.publisher) || 'Unknown';
    byMonthAuthor[m][a] = (byMonthAuthor[m][a] || 0) + 1;
  });

  const authorDatasets = allAuthors.map((author, i) => ({
    label: author,
    data: sortedMonths.map(m => byMonthAuthor[m]?.[author] || 0),
    backgroundColor: PALETTE[i % PALETTE.length],
    borderRadius: 2,
    stack: 'current',
  }));
  if (previousMonthly) authorDatasets.push(buildPreviousLineDataset());

  makeChart('chart-author', {
    type: 'bar',
    data: {
      labels: monthLabels,
      datasets: authorDatasets,
    },
    options: {
      ...baseOptions,
      scales: {
        x: { stacked: true },
        y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } },
      },
      plugins: {
        legend: { position: 'bottom' },
        tooltip: { callbacks: buildPreviousLineTooltipCallbacks() },
      },
    },
  });

  // ── 3. Content type (stacked bar by publisher) ────────────────────────────
  const CONTENT_TYPE_SMALL_THRESHOLD = 0.02;
  const OTHERS_BUCKET_LABEL = 'Others';
  const typeCountsRaw = countByKey(data, chartPickFirst, CHART_FIELD_KEYS.category);
  const totalTypeCount = Object.values(typeCountsRaw).reduce((sum, v) => sum + v, 0);
  const sortedTypeEntries = Object.entries(typeCountsRaw).sort((a, b) => b[1] - a[1]);
  const smallTypeNames = new Set();
  const mainTypeEntries = [];
  sortedTypeEntries.forEach(([type, count]) => {
    const ratio = totalTypeCount ? count / totalTypeCount : 0;
    if (ratio < CONTENT_TYPE_SMALL_THRESHOLD) smallTypeNames.add(type);
    else mainTypeEntries.push([type, count]);
  });
  const othersTotal = sortedTypeEntries
    .filter(([type]) => smallTypeNames.has(type))
    .reduce((sum, [, v]) => sum + v, 0);
  const groupedTypeEntries = othersTotal > 0
    ? [...mainTypeEntries, [OTHERS_BUCKET_LABEL, othersTotal]]
    : mainTypeEntries;

  const contentPublishers = [...new Set(data.map(
    (row) => chartPickFirst(row, CHART_FIELD_KEYS.publisher) || 'Unknown',
  ))];
  const contentTypePublisherCounts = {};
  groupedTypeEntries.forEach(([type]) => {
    contentTypePublisherCounts[type] = {};
    contentPublishers.forEach((publisher) => {
      contentTypePublisherCounts[type][publisher] = 0;
    });
  });
  data.forEach((row) => {
    const rawType = chartPickFirst(row, CHART_FIELD_KEYS.category) || 'Unknown';
    const bucket = smallTypeNames.has(rawType) ? OTHERS_BUCKET_LABEL : rawType;
    if (!contentTypePublisherCounts[bucket]) return;
    const publisher = chartPickFirst(row, CHART_FIELD_KEYS.publisher) || 'Unknown';
    contentTypePublisherCounts[bucket][publisher] = (contentTypePublisherCounts[bucket][publisher] || 0) + 1;
  });

  const contentTypeKeys = groupedTypeEntries.map(([type]) => type);
  const contentTypeTotals = groupedTypeEntries.map(([, count]) => count);
  const contentTypeDisplayLabels = groupedTypeEntries.map(([type, count]) => {
    const pct = totalTypeCount ? Math.round((count / totalTypeCount) * 1000) / 10 : 0;
    return `${type} (${count}, ${pct}%)`;
  });

  let contentTypePreviousTotals = null;
  if (showCompare && previousData.length) {
    const prevTypeCounts = countByKey(previousData, chartPickFirst, CHART_FIELD_KEYS.category);
    contentTypePreviousTotals = contentTypeKeys.map((key) => {
      if (key === OTHERS_BUCKET_LABEL) {
        return [...smallTypeNames].reduce((sum, t) => sum + (prevTypeCounts[t] || 0), 0);
      }
      return prevTypeCounts[key] || 0;
    });
  }

  makeChart('chart-type', {
    type: 'bar',
    data: {
      labels: contentTypeDisplayLabels,
      datasets: contentPublishers.map((publisher, i) => ({
        label: publisher,
        data: contentTypeKeys.map((type) => contentTypePublisherCounts[type]?.[publisher] || 0),
        backgroundColor: PALETTE[i % PALETTE.length],
      })),
    },
    options: {
      ...baseOptions,
      indexAxis: 'y',
      layout: contentTypePreviousTotals ? { padding: { right: 56 } } : {},
      scales: {
        x: { stacked: true, beginAtZero: true, ticks: { precision: 0 } },
        y: { stacked: true },
      },
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            label: (context) => `${context.dataset.label}: ${context.parsed.x || 0}`,
          },
        },
        deltaBadge: {
          enabled: !!contentTypePreviousTotals,
          totals: contentTypeTotals,
          previousTotals: contentTypePreviousTotals || [],
        },
      },
    },
  });

  // ── 4. Publishers stacked bar (segmented by content type) ────────────────
  const publisherCountsRaw = countByKey(data, chartPickFirst, CHART_FIELD_KEYS.publisher);
  const totalPublisherCount = Object.values(publisherCountsRaw).reduce((sum, v) => sum + v, 0);
  const sortedPublisherEntries = Object.entries(publisherCountsRaw).sort((a, b) => b[1] - a[1]);
  const publisherKeys = sortedPublisherEntries.map(([name]) => name);
  const publisherDisplayLabels = sortedPublisherEntries.map(([name, count]) => {
    const pct = totalPublisherCount ? Math.round((count / totalPublisherCount) * 1000) / 10 : 0;
    return `${name} (${count}, ${pct}%)`;
  });

  const publisherCategorySet = new Set();
  data.forEach((row) => {
    publisherCategorySet.add(chartPickFirst(row, CHART_FIELD_KEYS.category) || 'Unknown');
  });
  const publisherCategoryKeys = [...publisherCategorySet];
  const publisherCategoryCounts = {};
  publisherKeys.forEach((publisher) => {
    publisherCategoryCounts[publisher] = {};
    publisherCategoryKeys.forEach((category) => {
      publisherCategoryCounts[publisher][category] = 0;
    });
  });
  data.forEach((row) => {
    const publisher = chartPickFirst(row, CHART_FIELD_KEYS.publisher) || 'Unknown';
    if (!publisherCategoryCounts[publisher]) return;
    const category = chartPickFirst(row, CHART_FIELD_KEYS.category) || 'Unknown';
    publisherCategoryCounts[publisher][category] = (publisherCategoryCounts[publisher][category] || 0) + 1;
  });

  const publisherTotals = sortedPublisherEntries.map(([, count]) => count);
  let publisherPreviousTotals = null;
  if (showCompare && previousData.length) {
    const prevPublisherCounts = countByKey(previousData, chartPickFirst, CHART_FIELD_KEYS.publisher);
    publisherPreviousTotals = publisherKeys.map((key) => prevPublisherCounts[key] || 0);
  }

  makeChart('chart-publishers', {
    type: 'bar',
    data: {
      labels: publisherDisplayLabels,
      datasets: publisherCategoryKeys.map((category, i) => ({
        label: category,
        data: publisherKeys.map((publisher) => publisherCategoryCounts[publisher]?.[category] || 0),
        backgroundColor: PALETTE[i % PALETTE.length],
      })),
    },
    options: {
      ...baseOptions,
      indexAxis: 'y',
      layout: publisherPreviousTotals ? { padding: { right: 56 } } : {},
      scales: {
        x: { stacked: true, beginAtZero: true, ticks: { precision: 0 } },
        y: { stacked: true },
      },
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            label: (context) => `${context.dataset.label}: ${context.parsed.x || 0}`,
          },
        },
        deltaBadge: {
          enabled: !!publisherPreviousTotals,
          totals: publisherTotals,
          previousTotals: publisherPreviousTotals || [],
        },
      },
    },
  });

  // ── 5. Top topics / technologies (stacked by author) ─────────────────────
  const rawTopicEntries = Object.entries(countTechnologyTopics(data))
    .sort((a, b) => b[1] - a[1]);
  const allAuthorsForTopics = [...new Set(data.map((row) => chartPickFirst(row, CHART_FIELD_KEYS.publisher) || 'Unknown'))];
  const rawTopicAuthorCounts = {};
  rawTopicEntries.forEach(([topic]) => {
    rawTopicAuthorCounts[topic] = {};
    allAuthorsForTopics.forEach((author) => {
      rawTopicAuthorCounts[topic][author] = 0;
    });
  });
  data.forEach((row) => {
    const author = chartPickFirst(row, CHART_FIELD_KEYS.publisher) || 'Unknown';
    getTechnologyTopics(row).forEach((topic) => {
      if (!rawTopicAuthorCounts[topic]) return;
      rawTopicAuthorCounts[topic][author] = (rawTopicAuthorCounts[topic][author] || 0) + 1;
    });
  });

  const topicGrouped = applyTopNWithOthers(rawTopicEntries, rawTopicAuthorCounts, TOP_N_LIMIT);
  const tailTopicEntries = rawTopicEntries.slice(TOP_N_LIMIT);
  const isTopicDrilled = isChartDrilled('chart-topic') && tailTopicEntries.length > 0;

  const topicViewKeys = isTopicDrilled
    ? tailTopicEntries.map(([k]) => k)
    : topicGrouped.keys;
  const topicViewTotalsMap = isTopicDrilled
    ? Object.fromEntries(tailTopicEntries)
    : topicGrouped.totals;
  const topicAuthorCounts = isTopicDrilled
    ? rawTopicAuthorCounts
    : topicGrouped.subDimMap;
  const topicTotals = topicViewKeys.map((topic) => topicViewTotalsMap[topic] || 0);
  const topicDisplayLabels = topicViewKeys.map((topic) => `${topic} (${topicViewTotalsMap[topic] || 0})`);
  const topicOthersIndex = (!isTopicDrilled && topicGrouped.othersKey)
    ? topicViewKeys.indexOf(topicGrouped.othersKey)
    : -1;

  let topicPreviousTotals = null;
  if (showCompare && previousData.length) {
    const prevTopicCounts = countTechnologyTopics(previousData);
    topicPreviousTotals = topicViewKeys.map((topic) => {
      if (topic === topicGrouped.othersKey) {
        const tailKeys = tailTopicEntries.map(([k]) => k);
        return tailKeys.reduce((sum, k) => sum + (prevTopicCounts[k] || 0), 0);
      }
      return prevTopicCounts[topic] || 0;
    });
  }

  makeChart('chart-topic', {
    type: 'bar',
    data: {
      labels: topicDisplayLabels,
      datasets: allAuthorsForTopics.map((author, i) => ({
        label: author,
        data: topicViewKeys.map((topic) => topicAuthorCounts[topic]?.[author] || 0),
        backgroundColor: PALETTE[i % PALETTE.length],
      })),
    },
    options: {
      ...baseOptions,
      indexAxis: 'y',
      layout: topicPreviousTotals ? { padding: { right: 56 } } : {},
      onClick: (event, elements, chart) => {
        const drill = chart.options?.plugins?.drillDown;
        if (!drill || drill.othersIndex === undefined || drill.othersIndex < 0) return;
        if (!Array.isArray(elements) || elements.length === 0) return;
        if (elements[0].index !== drill.othersIndex) return;
        event?.native?.stopPropagation?.();
        setDrillState('chart-topic', { mode: 'others' });
      },
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
        deltaBadge: {
          enabled: !!topicPreviousTotals,
          totals: topicTotals,
          previousTotals: topicPreviousTotals || [],
        },
        drillDown: {
          chartId: 'chart-topic',
          othersIndex: topicOthersIndex,
          tailCount: tailTopicEntries.length,
        },
      },
    },
  });
  updateDrillBackButton('chart-topic', isTopicDrilled, `← Back to top ${TOP_N_LIMIT}`);

  // ── 6. Language (horizontal bar) ─────────────────────────────────────────
  const langEntries = Object.entries(countByKey(data, chartPickFirst, CHART_FIELD_KEYS.language))
    .sort((a, b) => b[1] - a[1]);
  const langLabels = langEntries.map(([k]) => k);
  const langTotals = langEntries.map(([, v]) => v);
  const langDisplayLabels = langEntries.map(([k, v]) => `${k} (${v})`);

  let langPreviousTotals = null;
  if (showCompare && previousData.length) {
    const prevLangCounts = countByKey(previousData, chartPickFirst, CHART_FIELD_KEYS.language);
    langPreviousTotals = langLabels.map((k) => prevLangCounts[k] || 0);
  }

  makeChart('chart-language', {
    type: 'bar',
    data: {
      labels: langDisplayLabels,
      datasets: [{
        label: 'Posts',
        data: langTotals,
        backgroundColor: langLabels.map((_, i) => PALETTE[i % PALETTE.length]),
      }],
    },
    options: {
      ...baseOptions,
      indexAxis: 'y',
      layout: langPreviousTotals ? { padding: { right: 56 } } : {},
      scales: {
        x: { beginAtZero: true, ticks: { precision: 0 } },
        y: {},
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => `${context.parsed.x || 0} posts`,
          },
        },
        deltaBadge: {
          enabled: !!langPreviousTotals,
          totals: langTotals,
          previousTotals: langPreviousTotals || [],
        },
      },
    },
  });

  // ── 7. Contributors (horizontal bar, top 10 + Others) ────────────────────
  const rawContributorEntries = Object.entries(countContributors(data))
    .sort((a, b) => b[1] - a[1]);
  const contributorsTitleEl = document.querySelector('#chart-contributors-card .chart-title');
  if (contributorsTitleEl) {
    contributorsTitleEl.textContent = `People involved (${countUniqueContributors(data)})`;
  }
  const contributorGrouped = applyTopNWithOthers(rawContributorEntries, null, TOP_N_LIMIT);
  const tailContributorEntries = rawContributorEntries.slice(TOP_N_LIMIT);
  const isContribDrilled = isChartDrilled('chart-contributors') && tailContributorEntries.length > 0;

  const contributorViewKeys = isContribDrilled
    ? tailContributorEntries.map(([k]) => k)
    : contributorGrouped.keys;
  const contributorViewTotalsMap = isContribDrilled
    ? Object.fromEntries(tailContributorEntries)
    : contributorGrouped.totals;
  const contributorTotals = contributorViewKeys.map((k) => contributorViewTotalsMap[k] || 0);
  const contributorDisplayLabels = contributorViewKeys.map((k) => `${k} (${contributorViewTotalsMap[k] || 0})`);
  const contributorOthersIndex = (!isContribDrilled && contributorGrouped.othersKey)
    ? contributorViewKeys.indexOf(contributorGrouped.othersKey)
    : -1;

  let contributorPreviousTotals = null;
  if (showCompare && previousData.length) {
    const prevContributorCounts = countContributors(previousData);
    contributorPreviousTotals = contributorViewKeys.map((k) => {
      if (k === contributorGrouped.othersKey) {
        const tailKeys = tailContributorEntries.map(([n]) => n);
        return tailKeys.reduce((sum, n) => sum + (prevContributorCounts[n] || 0), 0);
      }
      return prevContributorCounts[k] || 0;
    });
  }

  makeChart('chart-contributors', {
    type: 'bar',
    data: {
      labels: contributorDisplayLabels,
      datasets: [{
        label: 'Posts',
        data: contributorTotals,
        backgroundColor: contributorViewKeys.map((_, i) => PALETTE[i % PALETTE.length]),
      }],
    },
    options: {
      ...baseOptions,
      indexAxis: 'y',
      layout: contributorPreviousTotals ? { padding: { right: 56 } } : {},
      onClick: (event, elements, chart) => {
        const drill = chart.options?.plugins?.drillDown;
        if (!drill || drill.othersIndex === undefined || drill.othersIndex < 0) return;
        if (!Array.isArray(elements) || elements.length === 0) return;
        if (elements[0].index !== drill.othersIndex) return;
        event?.native?.stopPropagation?.();
        setDrillState('chart-contributors', { mode: 'others' });
      },
      scales: {
        x: { beginAtZero: true, ticks: { precision: 0 } },
        y: {},
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => `${context.parsed.x || 0} posts`,
          },
        },
        deltaBadge: {
          enabled: !!contributorPreviousTotals,
          totals: contributorTotals,
          previousTotals: contributorPreviousTotals || [],
        },
        drillDown: {
          chartId: 'chart-contributors',
          othersIndex: contributorOthersIndex,
          tailCount: tailContributorEntries.length,
        },
      },
    },
  });
  updateDrillBackButton('chart-contributors', isContribDrilled, `← Back to top ${TOP_N_LIMIT}`);

  if (expandedChartId) renderExpandedChart(expandedChartId);
};

window.chartsCompare = {
  getCompareMode,
  setCompareMode,
  getPreviousRange,
  getPreviousFilteredData,
  COMPARE_MODE_NONE,
  COMPARE_MODE_PREVIOUS_PERIOD,
};

window.chartsDrill = {
  setDrillState,
  isChartDrilled,
  DRILLABLE_CHART_IDS,
};

function initializeCompareModeControl() {
  const select = document.getElementById('insights-compare-mode');
  if (!select || typeof select.addEventListener !== 'function') return;
  select.value = getCompareMode();
  select.addEventListener('change', () => {
    setCompareMode(select.value);
    if (typeof window.renderCharts === 'function') window.renderCharts();
  });
}

initializeCompareModeControl();

// Re-render whenever the Trends tab becomes active.
const handleTabActivation = () => {
  const trendsTab = document.querySelector('#tab-trends');
  if (trendsTab?.classList.contains('active') && window.activityData?.length) {
    window.renderCharts();
  }
};

document.querySelector('#tab-trends-trigger')?.addEventListener('shown.bs.tab', handleTabActivation);
initializeChartCardExpansion();
