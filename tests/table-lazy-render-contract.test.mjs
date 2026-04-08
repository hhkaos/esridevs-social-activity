import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const readProjectFile = (filename) => fs.readFileSync(path.join(projectRoot, filename), 'utf8');

test('table markup and scripts expose incremental row rendering hooks', () => {
  const indexHtml = readProjectFile('index.html');
  const loadTableJs = readProjectFile('load-table.js');
  const applyFiltersJs = readProjectFile('apply-filters.js');
  const chartsJs = readProjectFile('charts.js');

  assert.match(indexHtml, /id="table-scroll-sentinel"/);
  assert.match(loadTableJs, /const TABLE_INITIAL_RENDER_COUNT = 60;/);
  assert.match(loadTableJs, /const TABLE_INCREMENTAL_RENDER_COUNT = 80;/);
  assert.match(loadTableJs, /const maybeLoadMoreTableRows = \(\) => \{/);
  assert.match(loadTableJs, /tableScrollSentinelEl\.getBoundingClientRect\(\)/);
  assert.match(loadTableJs, /window\.updateRenderedTableRows = renderTableRows;/);
  assert.match(applyFiltersJs, /const getFilteredActivityRows = \(rows = window\.activityData \|\| \[\]\) => \{/);
  assert.match(applyFiltersJs, /window\.updateRenderedTableRows\(filteredRows\);/);
  assert.match(chartsJs, /window\.activityUtils\?\.filterActivityRows/);
});
