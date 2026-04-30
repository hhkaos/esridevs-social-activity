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

function setupContext(rows) {
  const renderedCharts = [];
  const storage = new Map();

  const context = {
    console,
    window: {
      activityData: rows,
      flags: { dateRange: { from: '', to: '' } },
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
  return { context, renderedCharts };
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

function buildTwelveTopicRows() {
  const rows = [];
  for (let i = 0; i < 12; i++) {
    const topic = `Topic-${String.fromCharCode(65 + i)}`;
    const count = 12 - i;
    for (let j = 0; j < count; j++) {
      rows.push(makeRow('2026-04-15', { Topics_Product: topic }));
    }
  }
  return rows;
}

// ── Plugin / API surface ─────────────────────────────────────────────────────

test('charts.js exposes window.chartsDrill with setDrillState and isChartDrilled', () => {
  const chartsJs = readProjectFile('charts.js');
  assert.match(chartsJs, /window\.chartsDrill\s*=\s*\{/);
  assert.match(chartsJs, /setDrillState/);
  assert.match(chartsJs, /isChartDrilled/);
});

test('chart-topic has an onClick handler that drills into the Others bucket', () => {
  const chartsJs = readProjectFile('charts.js');
  assert.match(chartsJs, /setDrillState\('chart-topic'/);
  assert.match(chartsJs, /setDrillState\('chart-contributors'/);
});

// ── Drill metadata when at root ──────────────────────────────────────────────

test('chart-topic at root exposes othersIndex pointing at the Others bar', () => {
  const rows = buildTwelveTopicRows();
  const { context, renderedCharts } = setupContext(rows);
  context.window.renderCharts();
  const topic = renderedCharts.find((c) => c.id === 'chart-topic');
  const drill = topic.config.options.plugins.drillDown;
  assert.equal(drill.chartId, 'chart-topic');
  assert.equal(drill.tailCount, 2);
  // 10 top topics + Others = index 10.
  assert.equal(drill.othersIndex, 10);
});

test('chart-contributors at root exposes othersIndex pointing at the Others bar', () => {
  const rows = [];
  for (let i = 0; i < 12; i++) {
    const name = `Person-${i}`;
    const count = 12 - i;
    for (let j = 0; j < count; j++) {
      rows.push(makeRow('2026-04-15', { 'People involved': name }));
    }
  }
  const { context, renderedCharts } = setupContext(rows);
  context.window.renderCharts();
  const contrib = renderedCharts.find((c) => c.id === 'chart-contributors');
  const drill = contrib.config.options.plugins.drillDown;
  assert.equal(drill.chartId, 'chart-contributors');
  assert.equal(drill.tailCount, 2);
  assert.equal(drill.othersIndex, 10);
});

test('chart-topic without an Others bucket reports othersIndex=-1', () => {
  const rows = [];
  for (let i = 0; i < 5; i++) {
    rows.push(makeRow('2026-04-15', { Topics_Product: `Topic-${i}` }));
  }
  const { context, renderedCharts } = setupContext(rows);
  context.window.renderCharts();
  const topic = renderedCharts.find((c) => c.id === 'chart-topic');
  const drill = topic.config.options.plugins.drillDown;
  assert.equal(drill.othersIndex, -1);
  assert.equal(drill.tailCount, 0);
});

// ── Drilled view ─────────────────────────────────────────────────────────────

test('drilling into Others on chart-topic re-renders with only tail topics', () => {
  const rows = buildTwelveTopicRows();
  const { context, renderedCharts } = setupContext(rows);
  context.window.renderCharts();
  // First render at root.
  let topic = renderedCharts.find((c) => c.id === 'chart-topic');
  assert.equal(topic.config.data.labels.length, 11, 'root has 10 + Others');

  // Drill in.
  context.window.chartsDrill.setDrillState('chart-topic', { mode: 'others' });

  // Find the most recent chart-topic render after the drill.
  const drilledTopic = [...renderedCharts].reverse().find((c) => c.id === 'chart-topic');
  // Tail = 2 topics.
  assert.equal(drilledTopic.config.data.labels.length, 2);
  assert.match(drilledTopic.config.data.labels[0], /^Topic-K/);
  assert.match(drilledTopic.config.data.labels[1], /^Topic-L/);
  // Drill metadata in drilled view: othersIndex=-1 (no nested drill).
  assert.equal(drilledTopic.config.options.plugins.drillDown.othersIndex, -1);
});

test('drilling into Others on chart-contributors re-renders with only tail contributors', () => {
  const rows = [];
  for (let i = 0; i < 12; i++) {
    const name = `Person-${i}`;
    const count = 12 - i;
    for (let j = 0; j < count; j++) {
      rows.push(makeRow('2026-04-15', { 'People involved': name }));
    }
  }
  const { context, renderedCharts } = setupContext(rows);
  context.window.renderCharts();
  context.window.chartsDrill.setDrillState('chart-contributors', { mode: 'others' });

  const drilled = [...renderedCharts].reverse().find((c) => c.id === 'chart-contributors');
  assert.equal(drilled.config.data.labels.length, 2);
  // Tail items: Person-10 and Person-11 (counts 2 and 1).
  assert.match(drilled.config.data.labels[0], /^Person-10/);
  assert.match(drilled.config.data.labels[1], /^Person-11/);
});

test('drilled chart-topic preserves comparison: tail-topic previous totals are per-topic', () => {
  const rows = buildTwelveTopicRows();
  // Add March (previous-period) data for tail topics.
  rows.push(makeRow('2026-03-10', { Topics_Product: 'Topic-K' }));
  rows.push(makeRow('2026-03-11', { Topics_Product: 'Topic-K' }));
  rows.push(makeRow('2026-03-12', { Topics_Product: 'Topic-L' }));

  const { context, renderedCharts } = setupContext(rows);
  context.window.flags = { dateRange: { from: '2026-04-01', to: '2026-04-30' } };
  context.window.localStorage.setItem('esridevs_compare_mode_v1', 'previous-period');
  context.window.renderCharts();
  context.window.chartsDrill.setDrillState('chart-topic', { mode: 'others' });

  const drilled = [...renderedCharts].reverse().find((c) => c.id === 'chart-topic');
  const badgeOpts = drilled.config.options.plugins.deltaBadge;
  // Tail topics: Topic-K (current 2, prev 2), Topic-L (current 1, prev 1).
  assert.deepEqual(Array.from(badgeOpts.totals), [2, 1]);
  assert.deepEqual(Array.from(badgeOpts.previousTotals), [2, 1]);
});

// ── Reset behavior ───────────────────────────────────────────────────────────

test('an external renderCharts call resets the drill state', () => {
  const rows = buildTwelveTopicRows();
  const { context, renderedCharts } = setupContext(rows);
  context.window.renderCharts();
  context.window.chartsDrill.setDrillState('chart-topic', { mode: 'others' });

  // External render (e.g., filter change).
  context.window.renderCharts();

  const latest = [...renderedCharts].reverse().find((c) => c.id === 'chart-topic');
  // Back at root: 10 + Others.
  assert.equal(latest.config.data.labels.length, 11);
});

test('exiting drill via setDrillState(chartId, null) returns to the root view', () => {
  const rows = buildTwelveTopicRows();
  const { context, renderedCharts } = setupContext(rows);
  context.window.renderCharts();
  context.window.chartsDrill.setDrillState('chart-topic', { mode: 'others' });
  context.window.chartsDrill.setDrillState('chart-topic', null);

  const latest = [...renderedCharts].reverse().find((c) => c.id === 'chart-topic');
  assert.equal(latest.config.data.labels.length, 11);
});
