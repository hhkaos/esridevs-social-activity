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

function buildRows() {
  // Esri:    3 Blog + 2 Video           = 5 (50%)
  // Community: 2 Blog + 1 Podcast       = 3 (30%)
  // Distributor: 2 Video                 = 2 (20%)
  // Total = 10
  return [
    { Date: '2026-01-01', Publisher: 'Esri', Category: 'Blog' },
    { Date: '2026-01-01', Publisher: 'Esri', Category: 'Blog' },
    { Date: '2026-01-01', Publisher: 'Esri', Category: 'Blog' },
    { Date: '2026-01-02', Publisher: 'Esri', Category: 'Video' },
    { Date: '2026-01-02', Publisher: 'Esri', Category: 'Video' },
    { Date: '2026-01-03', Publisher: 'Community', Category: 'Blog' },
    { Date: '2026-01-03', Publisher: 'Community', Category: 'Blog' },
    { Date: '2026-01-04', Publisher: 'Community', Category: 'Podcast' },
    { Date: '2026-01-05', Publisher: 'Distributor', Category: 'Video' },
    { Date: '2026-01-05', Publisher: 'Distributor', Category: 'Video' },
  ];
}

test('publishers chart renders as a horizontal stacked bar chart', () => {
  const rows = buildRows();
  const renderedCharts = renderChartsWithRows(rows);
  const publishersChart = renderedCharts.find((chart) => chart.id === 'chart-publishers');

  assert.ok(publishersChart, 'Expected the publishers chart to render');
  assert.equal(publishersChart.config.type, 'bar');
  assert.equal(publishersChart.config.options.indexAxis, 'y');
  assert.equal(publishersChart.config.options.scales.x.stacked, true);
  assert.equal(publishersChart.config.options.scales.y.stacked, true);
});

test('publishers chart uses Publisher field, not Channel owner', () => {
  // Differentiating row: Publisher and Channel owner have different values.
  const rows = [
    { Date: '2026-01-01', Publisher: 'Esri', 'Channel owner': 'Community', Category: 'Blog' },
    { Date: '2026-01-02', Publisher: 'Multiple', 'Channel owner': 'Esri', Category: 'Video' },
  ];
  const renderedCharts = renderChartsWithRows(rows);
  const publishersChart = renderedCharts.find((chart) => chart.id === 'chart-publishers');

  const labels = Array.from(publishersChart.config.data.labels);
  const labelText = labels.join(' | ');
  assert.ok(labelText.includes('Esri'), 'expected Publisher value Esri to appear');
  assert.ok(labelText.includes('Multiple'), 'expected Publisher value Multiple to appear');
  // Should NOT use Channel owner value Community for any label
  assert.equal(labels.some((l) => l.startsWith('Community ')), false);
});

test('publishers chart bars are segmented by content type (Category)', () => {
  const rows = buildRows();
  const renderedCharts = renderChartsWithRows(rows);
  const publishersChart = renderedCharts.find((chart) => chart.id === 'chart-publishers');

  const datasetLabels = Array.from(publishersChart.config.data.datasets).map((d) => d.label).sort();
  assert.deepEqual(datasetLabels, ['Blog', 'Podcast', 'Video']);

  // Bars sorted by total count desc: Esri (5), Community (3), Distributor (2)
  const blog = publishersChart.config.data.datasets.find((d) => d.label === 'Blog');
  const video = publishersChart.config.data.datasets.find((d) => d.label === 'Video');
  const podcast = publishersChart.config.data.datasets.find((d) => d.label === 'Podcast');
  assert.deepEqual(Array.from(blog.data), [3, 2, 0]);
  assert.deepEqual(Array.from(video.data), [2, 0, 2]);
  assert.deepEqual(Array.from(podcast.data), [0, 1, 0]);
});

test('publishers chart labels include count and percentage of total', () => {
  const rows = buildRows();
  const renderedCharts = renderChartsWithRows(rows);
  const publishersChart = renderedCharts.find((chart) => chart.id === 'chart-publishers');

  // Total = 10; Esri 5 → 50%, Community 3 → 30%, Distributor 2 → 20%
  assert.deepEqual(Array.from(publishersChart.config.data.labels), [
    'Esri (5, 50%)',
    'Community (3, 30%)',
    'Distributor (2, 20%)',
  ]);
});

test('publishers chart sorts bars by total count descending', () => {
  const rows = [
    { Date: '2026-01-01', Publisher: 'Community', Category: 'Blog' },
    { Date: '2026-01-01', Publisher: 'Community', Category: 'Blog' },
    { Date: '2026-01-01', Publisher: 'Community', Category: 'Blog' },
    { Date: '2026-01-02', Publisher: 'Esri', Category: 'Video' },
    { Date: '2026-01-02', Publisher: 'Esri', Category: 'Video' },
    { Date: '2026-01-02', Publisher: 'Esri', Category: 'Video' },
    { Date: '2026-01-02', Publisher: 'Esri', Category: 'Video' },
    { Date: '2026-01-03', Publisher: 'Multiple', Category: 'Blog' },
  ];
  const renderedCharts = renderChartsWithRows(rows);
  const publishersChart = renderedCharts.find((chart) => chart.id === 'chart-publishers');

  const labels = Array.from(publishersChart.config.data.labels);
  // Esri (4) > Community (3) > Multiple (1)
  assert.equal(labels[0].startsWith('Esri '), true);
  assert.equal(labels[1].startsWith('Community '), true);
  assert.equal(labels[2].startsWith('Multiple '), true);
});

test('publishers chart no longer renders as a doughnut on chart-channel', () => {
  const rows = buildRows();
  const renderedCharts = renderChartsWithRows(rows);
  const channelChart = renderedCharts.find((chart) => chart.id === 'chart-channel');
  assert.equal(channelChart, undefined, 'old chart-channel doughnut should be removed');
});
