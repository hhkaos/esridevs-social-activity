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

test('top topics chart splits comma-delimited technology cells before counting', () => {
  const renderedCharts = renderChartsWithRows([
    {
      Date: '2026-04-01',
      Publisher: 'Esri',
      'Channel owner': 'Esri',
      Language: 'English',
      Topics_Product: 'ArcGIS Dashboards, Arcade',
      Category: 'Blog',
    },
    {
      Date: '2026-04-02',
      Publisher: 'Community',
      'Channel owner': 'Community',
      Language: 'English',
      Topics_Product: 'Arcade',
      Category: 'Video',
    },
    {
      Date: '2026-04-03',
      Publisher: 'Esri',
      'Channel owner': 'Esri',
      Language: 'English',
      Topics_Product: 'ArcGIS Dashboards, Calcite Design System',
      Category: 'Blog',
    },
  ]);

  const topicChart = renderedCharts.find((chart) => chart.id === 'chart-topic');
  assert.ok(topicChart, 'Expected the top topics chart to render');

  const labels = Array.from(topicChart.config.data.labels);
  assert.equal(labels.includes('ArcGIS Dashboards, Arcade'), false);
  assert.equal(labels.includes('ArcGIS Dashboards, Calcite Design System'), false);
  assert.deepEqual(labels, ['ArcGIS Dashboards (2)', 'Arcade (2)', 'Calcite Design System (1)']);

  const esriDataset = topicChart.config.data.datasets.find((dataset) => dataset.label === 'Esri');
  const communityDataset = topicChart.config.data.datasets.find((dataset) => dataset.label === 'Community');

  assert.deepEqual(Array.from(esriDataset.data), [2, 1, 1]);
  assert.deepEqual(Array.from(communityDataset.data), [0, 1, 0]);
});
