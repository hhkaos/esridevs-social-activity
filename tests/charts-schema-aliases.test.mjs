import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const readProjectFile = (relativePath) =>
  fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

test('charts reads Publisher, Channel owner, and People involved through shared schema aliases', () => {
  const chartsJs = readProjectFile('charts.js');

  assert.equal(
    chartsJs.includes('const CHART_FIELD_KEYS = {'),
    true,
    'Expected charts.js to define a shared chart field alias map',
  );

  assert.equal(
    chartsJs.includes('publisher: window.activityUtils?.OPEN_SHEET_FIELD_ALIASES?.publisher'),
    true,
    'Expected charts.js to source publisher aliases from activity-utils',
  );

  assert.equal(
    chartsJs.includes('channelOwner: window.activityUtils?.OPEN_SHEET_FIELD_ALIASES?.channelOwner'),
    true,
    'Expected charts.js to source channel owner aliases from activity-utils',
  );

  assert.equal(
    chartsJs.includes('peopleInvolved: window.activityUtils?.OPEN_SHEET_FIELD_ALIASES?.peopleInvolved'),
    true,
    'Expected charts.js to source people involved aliases from activity-utils',
  );
});

test('charts filters and aggregations use alias-aware accessors instead of legacy fixed headers', () => {
  const chartsJs = readProjectFile('charts.js');

  assert.equal(
    chartsJs.includes('[authors, chartPickFirst(row, CHART_FIELD_KEYS.publisher), false]'),
    true,
    'Expected chart filtering to read publisher values through aliases',
  );

  assert.equal(
    chartsJs.includes('[channels, chartPickFirst(row, CHART_FIELD_KEYS.channelOwner), false]'),
    true,
    'Expected chart filtering to read channel owner values through aliases',
  );

  assert.equal(
    chartsJs.includes('return chartPickFirst(row, CHART_FIELD_KEYS.peopleInvolved);'),
    true,
    'Expected people involved charts to read contributors through aliases',
  );

  assert.equal(
    chartsJs.includes('countByKey(data, chartPickFirst, CHART_FIELD_KEYS.channelOwner)'),
    true,
    'Expected doughnut charts to aggregate channel owner values through aliases',
  );

  assert.equal(
    chartsJs.includes('countByKey(data, chartPickFirst, CHART_FIELD_KEYS.category)'),
    true,
    'Expected content type chart aggregation to remain alias-aware',
  );
});
