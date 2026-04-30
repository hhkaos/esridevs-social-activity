import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const activityUtils = require('../activity-utils.js');

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const readProjectFile = (relativePath) =>
  fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

const ALIASES = {
  date: ['Date'],
  publisher: ['Publisher', 'Author', 'Authors'],
  peopleInvolved: ['People involved', 'People Involved', 'People_involved', 'Contributors', 'Contributor', 'Authors'],
  channelOwner: ['Channel owner', 'Channel Owner', 'Channel_owner', 'ChannelOwner', 'Channel'],
  language: ['Language', 'Languages'],
  technology: ['Topics_Product', 'Technology', 'Technologies'],
  category: ['Category', 'Category / Content type', 'Content type'],
};

function buildContext(rows, { compareMode = 'none', dateRange = null } = {}) {
  const renderedCharts = [];
  const storage = new Map();
  if (compareMode !== 'none') storage.set('esridevs_compare_mode_v1', compareMode);

  const flags = dateRange
    ? { dateRange }
    : { dateRange: { from: '', to: '' } };

  const context = {
    console,
    window: {
      activityData: rows,
      flags,
      activityUtils: {
        ...activityUtils,
        OPEN_SHEET_FIELD_ALIASES: ALIASES,
      },
      bootstrap: { Modal: class {} },
      localStorage: {
        getItem: (k) => (storage.has(k) ? storage.get(k) : null),
        setItem: (k, v) => storage.set(k, v),
        removeItem: (k) => storage.delete(k),
      },
    },
    document: {
      getElementById(id) {
        return {
          id,
          parentElement: { getBoundingClientRect: () => ({ width: 640, height: 360 }) },
        };
      },
      querySelector() { return null; },
      querySelectorAll() { return []; },
    },
  };

  context.Chart = class ChartStub {
    constructor(ctx, config) {
      this.ctx = ctx;
      this.config = config;
      renderedCharts.push({ id: ctx.id, config });
    }
    destroy() {}
  };
  context.window.Chart = context.Chart;

  vm.runInNewContext(readProjectFile('charts.js'), context);
  context.window.renderCharts();
  return { renderedCharts, context };
}

function makeRow(date, overrides = {}) {
  return {
    Date: date,
    Publisher: 'Esri',
    Category: 'Blog',
    'Channel owner': 'Channel A',
    Language: 'English',
    Topics_Product: 'JavaScript',
    'People involved': 'Alice',
    ...overrides,
  };
}

// ── Phase 6: donut → horizontal bar swap ─────────────────────────────────────

test('chart-language renders as a horizontal bar (no longer a doughnut)', () => {
  const rows = [
    makeRow('2026-04-15', { Language: 'English' }),
    makeRow('2026-04-15', { Language: 'English' }),
    makeRow('2026-04-15', { Language: 'Spanish' }),
  ];
  const { renderedCharts } = buildContext(rows);
  const lang = renderedCharts.find((c) => c.id === 'chart-language');
  assert.ok(lang);
  assert.equal(lang.config.type, 'bar');
  assert.equal(lang.config.options.indexAxis, 'y');
});

test('chart-contributors renders as a horizontal bar (no longer a doughnut)', () => {
  const rows = [
    makeRow('2026-04-15', { 'People involved': 'Alice' }),
    makeRow('2026-04-15', { 'People involved': 'Bob' }),
  ];
  const { renderedCharts } = buildContext(rows);
  const contrib = renderedCharts.find((c) => c.id === 'chart-contributors');
  assert.ok(contrib);
  assert.equal(contrib.config.type, 'bar');
  assert.equal(contrib.config.options.indexAxis, 'y');
});

// ── Phase 5: Top N + Others bucket ───────────────────────────────────────────

test('chart-topic groups topics beyond top 10 into an "Others (N)" bucket', () => {
  const rows = [];
  // Add 12 distinct topics with descending counts (12 down to 1).
  for (let i = 0; i < 12; i++) {
    const topic = `Topic-${String.fromCharCode(65 + i)}`;
    const count = 12 - i;
    for (let j = 0; j < count; j++) {
      rows.push(makeRow('2026-04-15', { Topics_Product: topic }));
    }
  }
  const { renderedCharts } = buildContext(rows);
  const topic = renderedCharts.find((c) => c.id === 'chart-topic');
  assert.ok(topic);
  const labels = topic.config.data.labels;
  // Top 10 + 1 Others = 11 labels max.
  assert.equal(labels.length, 11);
  const othersLabel = labels[labels.length - 1];
  assert.match(othersLabel, /^Others \(2\)/, 'expected Others bucket grouping the 2 tail topics');
});

test('chart-contributors groups contributors beyond top 10 into an "Others (N)" bucket', () => {
  const rows = [];
  for (let i = 0; i < 12; i++) {
    const name = `Person-${i}`;
    const count = 12 - i;
    for (let j = 0; j < count; j++) {
      rows.push(makeRow('2026-04-15', { 'People involved': name }));
    }
  }
  const { renderedCharts } = buildContext(rows);
  const contrib = renderedCharts.find((c) => c.id === 'chart-contributors');
  const labels = contrib.config.data.labels;
  assert.equal(labels.length, 11);
  assert.match(labels[labels.length - 1], /^Others \(2\)/);
});

test('chart-topic does not bucket Others when there are 10 or fewer topics', () => {
  const rows = [];
  for (let i = 0; i < 5; i++) {
    rows.push(makeRow('2026-04-15', { Topics_Product: `Topic-${i}` }));
  }
  const { renderedCharts } = buildContext(rows);
  const topic = renderedCharts.find((c) => c.id === 'chart-topic');
  const labels = topic.config.data.labels;
  assert.equal(labels.length, 5);
  assert.ok(!labels.some((l) => /^Others/.test(l)));
});

// ── Phase 3: ghost line on temporal charts ───────────────────────────────────

test('chart-overtime adds a previous-period line dataset when comparing with a date range', () => {
  // Current period: 2026-04 (April). Previous: 2026-03 (March).
  const rows = [
    makeRow('2026-04-01'),
    makeRow('2026-04-10'),
    makeRow('2026-03-05'),
    makeRow('2026-03-20'),
    makeRow('2026-03-22'),
  ];
  const { renderedCharts } = buildContext(rows, {
    compareMode: 'previous-period',
    dateRange: { from: '2026-04-01', to: '2026-04-30' },
  });
  const overtime = renderedCharts.find((c) => c.id === 'chart-overtime');
  const lineDataset = overtime.config.data.datasets.find((d) => d.type === 'line');
  assert.ok(lineDataset, 'expected a line dataset for previous-period total');
  assert.equal(lineDataset.label, 'Previous period (total)');
  // Current spans 1 month → previous totals length = 1, value = 3 (March count).
  assert.deepEqual(Array.from(lineDataset.data), [3]);
});

test('chart-overtime omits the previous-period line when compareMode is none', () => {
  const rows = [makeRow('2026-04-15'), makeRow('2026-03-15')];
  const { renderedCharts } = buildContext(rows, {
    compareMode: 'none',
    dateRange: { from: '2026-04-01', to: '2026-04-30' },
  });
  const overtime = renderedCharts.find((c) => c.id === 'chart-overtime');
  const lineDataset = overtime.config.data.datasets.find((d) => d.type === 'line');
  assert.equal(lineDataset, undefined);
});

// ── Ghost-line tooltip: shows both period labels, totals and delta ───────────

test('ghost-line dataset attaches per-index previous month labels and current totals', () => {
  // Current April (5 rows), previous March (3 rows).
  const rows = [
    makeRow('2026-04-01'),
    makeRow('2026-04-05'),
    makeRow('2026-04-10'),
    makeRow('2026-04-15'),
    makeRow('2026-04-20'),
    makeRow('2026-03-05'),
    makeRow('2026-03-15'),
    makeRow('2026-03-25'),
  ];
  const { renderedCharts } = buildContext(rows, {
    compareMode: 'previous-period',
    dateRange: { from: '2026-04-01', to: '2026-04-30' },
  });
  const overtime = renderedCharts.find((c) => c.id === 'chart-overtime');
  const lineDataset = overtime.config.data.datasets.find((d) => d.type === 'line');
  const meta = lineDataset.previousMeta;
  assert.ok(meta, 'expected ghost line dataset to expose previousMeta');
  assert.equal(meta.previousMonthLabels.length, 1);
  assert.match(meta.previousMonthLabels[0], /Mar/);
  assert.match(meta.currentMonthLabels[0], /Apr/);
  assert.deepEqual(Array.from(meta.currentMonthlyTotals), [5]);
});

test('ghost-line tooltip renders previous, current and delta lines for that point', () => {
  const rows = [
    makeRow('2026-04-01'),
    makeRow('2026-04-05'),
    makeRow('2026-04-10'),
    makeRow('2026-04-15'),
    makeRow('2026-04-20'),
    makeRow('2026-03-05'),
    makeRow('2026-03-15'),
    makeRow('2026-03-25'),
  ];
  const { renderedCharts } = buildContext(rows, {
    compareMode: 'previous-period',
    dateRange: { from: '2026-04-01', to: '2026-04-30' },
  });
  const overtime = renderedCharts.find((c) => c.id === 'chart-overtime');
  const tooltipCallbacks = overtime.config.options.plugins.tooltip.callbacks;
  const lineDataset = overtime.config.data.datasets.find((d) => d.type === 'line');

  const ghostItem = {
    dataset: lineDataset,
    dataIndex: 0,
    parsed: { y: 3 },
    label: lineDataset.previousMeta.currentMonthLabels[0],
  };
  const title = tooltipCallbacks.title([ghostItem]);
  assert.match(title, /Mar.*→.*Apr/);

  const labels = tooltipCallbacks.label(ghostItem);
  assert.ok(Array.isArray(labels), 'expected ghost label callback to return multiple lines');
  assert.equal(labels[0], 'Previous: 3');
  assert.equal(labels[1], 'Current: 5');
  assert.match(labels[2], /^Δ:\s*\+67%/);
  assert.match(labels[2], /▲/);
});

test('ghost-line tooltip falls back to default formatting for non-ghost datasets', () => {
  const rows = [
    makeRow('2026-04-01'),
    makeRow('2026-03-05'),
  ];
  const { renderedCharts } = buildContext(rows, {
    compareMode: 'previous-period',
    dateRange: { from: '2026-04-01', to: '2026-04-30' },
  });
  const overtime = renderedCharts.find((c) => c.id === 'chart-overtime');
  const tooltipCallbacks = overtime.config.options.plugins.tooltip.callbacks;
  const barDataset = overtime.config.data.datasets.find((d) => d.type !== 'line');

  const barItem = {
    dataset: barDataset,
    dataIndex: 0,
    parsed: { y: 1 },
    label: 'Apr \'26',
  };
  // Non-ghost item → title is the X-axis label, label is single string with dataset label.
  assert.equal(tooltipCallbacks.title([barItem]), 'Apr \'26');
  assert.equal(tooltipCallbacks.label(barItem), `${barDataset.label}: 1`);
});

test('ghost-line tooltip indicates "no previous" when previous slot is padded', () => {
  // Current spans 2 months, previous data only has 1 month worth → first index is padded.
  const rows = [
    makeRow('2026-03-15'),
    makeRow('2026-04-15'),
    // Previous period is Jan-Feb 2026; only February has data.
    makeRow('2026-02-15'),
  ];
  const { renderedCharts } = buildContext(rows, {
    compareMode: 'previous-period',
    dateRange: { from: '2026-03-01', to: '2026-04-30' },
  });
  const overtime = renderedCharts.find((c) => c.id === 'chart-overtime');
  const lineDataset = overtime.config.data.datasets.find((d) => d.type === 'line');
  const tooltipCallbacks = overtime.config.options.plugins.tooltip.callbacks;
  assert.equal(lineDataset.previousMeta.previousMonthLabels[0], null);

  const paddedItem = {
    dataset: lineDataset,
    dataIndex: 0,
    parsed: { y: 0 },
    label: lineDataset.previousMeta.currentMonthLabels[0],
  };
  assert.match(tooltipCallbacks.title([paddedItem]), /no previous/);
});

test('chart-author wires the ghost-line tooltip callbacks the same way as chart-overtime', () => {
  const rows = [
    makeRow('2026-04-05'),
    makeRow('2026-03-05'),
  ];
  const { renderedCharts } = buildContext(rows, {
    compareMode: 'previous-period',
    dateRange: { from: '2026-04-01', to: '2026-04-30' },
  });
  const author = renderedCharts.find((c) => c.id === 'chart-author');
  const callbacks = author.config.options.plugins.tooltip.callbacks;
  assert.equal(typeof callbacks.title, 'function');
  assert.equal(typeof callbacks.label, 'function');
  const ghost = author.config.data.datasets.find((d) => d.type === 'line');
  assert.ok(ghost?.previousMeta, 'expected chart-author ghost line to expose previousMeta');
});

// ── Phase 4: delta badge plugin options ──────────────────────────────────────

test('chart-publishers exposes delta badge totals/previousTotals when comparing', () => {
  const rows = [
    // Current period (April 2026)
    makeRow('2026-04-05', { Publisher: 'Esri' }),
    makeRow('2026-04-12', { Publisher: 'Esri' }),
    makeRow('2026-04-20', { Publisher: 'Community' }),
    // Previous period (March 2026)
    makeRow('2026-03-10', { Publisher: 'Esri' }),
    makeRow('2026-03-25', { Publisher: 'Distributor' }),
  ];
  const { renderedCharts } = buildContext(rows, {
    compareMode: 'previous-period',
    dateRange: { from: '2026-04-01', to: '2026-04-30' },
  });
  const publishers = renderedCharts.find((c) => c.id === 'chart-publishers');
  const badgeOpts = publishers.config.options.plugins.deltaBadge;
  assert.equal(badgeOpts.enabled, true);
  // Current totals: Esri=2, Community=1 (sorted desc)
  assert.deepEqual(Array.from(badgeOpts.totals), [2, 1]);
  // Previous totals aligned: Esri=1, Community=0
  assert.deepEqual(Array.from(badgeOpts.previousTotals), [1, 0]);
});

test('chart-language exposes delta badge totals/previousTotals when comparing', () => {
  const rows = [
    makeRow('2026-04-05', { Language: 'English' }),
    makeRow('2026-04-10', { Language: 'English' }),
    makeRow('2026-04-15', { Language: 'Spanish' }),
    makeRow('2026-03-12', { Language: 'English' }),
  ];
  const { renderedCharts } = buildContext(rows, {
    compareMode: 'previous-period',
    dateRange: { from: '2026-04-01', to: '2026-04-30' },
  });
  const lang = renderedCharts.find((c) => c.id === 'chart-language');
  const badgeOpts = lang.config.options.plugins.deltaBadge;
  assert.equal(badgeOpts.enabled, true);
  assert.deepEqual(Array.from(badgeOpts.totals), [2, 1]);
  assert.deepEqual(Array.from(badgeOpts.previousTotals), [1, 0]);
});

test('delta badge plugin is disabled when compareMode is none', () => {
  const rows = [makeRow('2026-04-15', { Language: 'English' })];
  const { renderedCharts } = buildContext(rows, { compareMode: 'none' });
  const lang = renderedCharts.find((c) => c.id === 'chart-language');
  assert.equal(lang.config.options.plugins.deltaBadge.enabled, false);
});

test('topic delta badge folds tail-topic previous counts into the Others bucket', () => {
  const rows = [];
  // Current period (April 2026): 12 topics with descending counts.
  for (let i = 0; i < 12; i++) {
    const topic = `Topic-${String.fromCharCode(65 + i)}`;
    const count = 12 - i;
    for (let j = 0; j < count; j++) {
      rows.push(makeRow('2026-04-15', { Topics_Product: topic }));
    }
  }
  // Previous period (March 2026): 2 rows for tail topics K & L.
  rows.push(makeRow('2026-03-10', { Topics_Product: 'Topic-K' }));
  rows.push(makeRow('2026-03-12', { Topics_Product: 'Topic-L' }));

  const { renderedCharts } = buildContext(rows, {
    compareMode: 'previous-period',
    dateRange: { from: '2026-04-01', to: '2026-04-30' },
  });
  const topic = renderedCharts.find((c) => c.id === 'chart-topic');
  const badgeOpts = topic.config.options.plugins.deltaBadge;
  assert.equal(badgeOpts.enabled, true);
  // Last entry of previousTotals is the Others bucket → tail topics K + L = 1 + 1 = 2.
  const previousTotals = Array.from(badgeOpts.previousTotals);
  assert.equal(previousTotals[previousTotals.length - 1], 2);
});

// ── Plugin registration contract ─────────────────────────────────────────────

test('charts.js defines a deltaBadge plugin that draws labels for horizontal bars', () => {
  const chartsJs = readProjectFile('charts.js');
  assert.match(chartsJs, /id:\s*'deltaBadge'/);
  assert.match(chartsJs, /afterDatasetsDraw/);
  assert.match(chartsJs, /Chart\.register\(deltaBadgePlugin\)/);
});
