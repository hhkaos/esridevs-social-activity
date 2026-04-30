import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const readProjectFile = (relativePath) =>
  fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

function renderChartsWithRows(rows) {
  const renderedCharts = [];
  const context = {
    console,
    window: {
      activityData: rows,
      flags: null,
      activityUtils: {
        pickFirst(row, keys) {
          for (const key of keys) {
            const value = `${row?.[key] ?? ''}`.trim();
            if (value) return value;
          }
          return '';
        },
        OPEN_SHEET_FIELD_ALIASES: {
          date: ['Date'],
          publisher: ['Publisher', 'Author', 'Authors'],
          peopleInvolved: ['People involved', 'People Involved', 'People_involved', 'Contributors', 'Contributor', 'Authors'],
          channelOwner: ['Channel owner', 'Channel Owner', 'Channel_owner', 'ChannelOwner', 'Channel'],
          language: ['Language', 'Languages'],
          technology: ['Topics_Product', 'Technology', 'Technologies'],
          category: ['Category', 'Category / Content type', 'Content type'],
        },
      },
      bootstrap: { Modal: class {} },
    },
    document: {
      getElementById(id) {
        return {
          id,
          parentElement: {
            getBoundingClientRect: () => ({ width: 640, height: 360 }),
          },
        };
      },
      querySelector() {
        return null;
      },
      querySelectorAll() {
        return [];
      },
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
  return renderedCharts;
}

function buildRows({ blog, video, sourceCode, podcast, training }) {
  const rows = [];
  for (let i = 0; i < blog; i++) rows.push({ Date: '2026-01-01', Publisher: 'Esri', Category: 'Blog' });
  for (let i = 0; i < video; i++) rows.push({ Date: '2026-01-02', Publisher: 'Community', Category: 'Video' });
  for (let i = 0; i < sourceCode; i++) rows.push({ Date: '2026-01-03', Publisher: 'Esri', Category: 'Source code' });
  for (let i = 0; i < podcast; i++) rows.push({ Date: '2026-01-04', Publisher: 'Distributor', Category: 'Podcast' });
  for (let i = 0; i < training; i++) rows.push({ Date: '2026-01-05', Publisher: 'Community', Category: 'Training seminar' });
  return rows;
}

test('content type chart renders as a horizontal stacked bar chart', () => {
  const rows = buildRows({ blog: 5, video: 3, sourceCode: 2, podcast: 0, training: 0 });
  const renderedCharts = renderChartsWithRows(rows);
  const typeChart = renderedCharts.find((chart) => chart.id === 'chart-type');

  assert.ok(typeChart, 'Expected the content type chart to render');
  assert.equal(typeChart.config.type, 'bar');
  assert.equal(typeChart.config.options.indexAxis, 'y');
  assert.equal(typeChart.config.options.scales.x.stacked, true);
  assert.equal(typeChart.config.options.scales.y.stacked, true);
});

test('content type bars are segmented by publisher', () => {
  const rows = buildRows({ blog: 5, video: 3, sourceCode: 2, podcast: 0, training: 0 });
  const renderedCharts = renderChartsWithRows(rows);
  const typeChart = renderedCharts.find((chart) => chart.id === 'chart-type');

  const datasetLabels = Array.from(typeChart.config.data.datasets).map((d) => d.label).sort();
  assert.deepEqual(datasetLabels, ['Community', 'Esri']);

  const esri = typeChart.config.data.datasets.find((d) => d.label === 'Esri');
  const community = typeChart.config.data.datasets.find((d) => d.label === 'Community');
  // Order of labels matches descending count: Blog (5), Video (3), Source code (2)
  assert.deepEqual(Array.from(esri.data), [5, 0, 2]);
  assert.deepEqual(Array.from(community.data), [0, 3, 0]);
});

test('content type labels include count and percentage of total', () => {
  const rows = buildRows({ blog: 5, video: 3, sourceCode: 2, podcast: 0, training: 0 });
  const renderedCharts = renderChartsWithRows(rows);
  const typeChart = renderedCharts.find((chart) => chart.id === 'chart-type');

  // Total = 10; 5 → 50%, 3 → 30%, 2 → 20%
  assert.deepEqual(Array.from(typeChart.config.data.labels), [
    'Blog (5, 50%)',
    'Video (3, 30%)',
    'Source code (2, 20%)',
  ]);
});

test('content type groups categories below 2% into an "Others" bucket', () => {
  // Total = 92; thresholds: Podcast 1/92 ≈ 1.087%, Training 1/92 ≈ 1.087% → both < 2%
  const rows = buildRows({ blog: 50, video: 30, sourceCode: 10, podcast: 1, training: 1 });
  const renderedCharts = renderChartsWithRows(rows);
  const typeChart = renderedCharts.find((chart) => chart.id === 'chart-type');

  const labels = Array.from(typeChart.config.data.labels);
  assert.equal(labels.length, 4);
  assert.equal(labels[0], 'Blog (50, 54.3%)');
  assert.equal(labels[1], 'Video (30, 32.6%)');
  assert.equal(labels[2], 'Source code (10, 10.9%)');
  assert.equal(labels[3], 'Others (2, 2.2%)');

  const distributor = typeChart.config.data.datasets.find((d) => d.label === 'Distributor');
  const community = typeChart.config.data.datasets.find((d) => d.label === 'Community');
  // Others = 1 Podcast (Distributor) + 1 Training (Community)
  assert.equal(distributor.data[3], 1);
  assert.equal(community.data[3], 1);
});

test('content type omits "Others" bucket when no category falls below threshold', () => {
  const rows = buildRows({ blog: 5, video: 3, sourceCode: 2, podcast: 0, training: 0 });
  const renderedCharts = renderChartsWithRows(rows);
  const typeChart = renderedCharts.find((chart) => chart.id === 'chart-type');

  const labels = Array.from(typeChart.config.data.labels);
  assert.equal(labels.includes('Others (0, 0%)'), false);
  assert.equal(labels.some((l) => l.startsWith('Others')), false);
});
