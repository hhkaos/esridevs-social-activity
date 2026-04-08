import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const readProjectFile = (relativePath) =>
  fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

test('content titles absorb the primary link and use a menu for multiple source links', () => {
  const loadTableSource = readProjectFile('load-table.js');

  assert.match(loadTableSource, /const renderContentLinkTitle = \(\{ title, contentLinks, featured = false, isNew = false \}\) => \{/);
  assert.match(loadTableSource, /contentLinks\.length === 1/);
  assert.match(loadTableSource, /table-title-link table-title-link--primary/);
  assert.match(loadTableSource, /contentLinks\.length > 1/);
  assert.match(loadTableSource, /table-title-link table-title-link--menu/);
  assert.match(loadTableSource, /class="dropdown-menu table-title-menu"/);
  assert.match(loadTableSource, /<li><h6 class="dropdown-header">Posted in:<\/h6><\/li>/);
  assert.doesNotMatch(loadTableSource, /<div class="small text-muted mt-1">Posted in:/);
});

test('table dates can switch to a compact mobile formatter and visible columns stay content-sized', () => {
  const loadTableSource = readProjectFile('load-table.js');
  const styleSource = readProjectFile('style.css');

  assert.match(loadTableSource, /const TABLE_DATE_COMPACT_FORMATTER = new Intl\.DateTimeFormat\('en-US'/);
  assert.match(loadTableSource, /window\.matchMedia\?\.\('\(max-width: 700px\)'\) \|\| null/);
  assert.match(loadTableSource, /const syncRenderedTableDates = \(\) => \{/);

  assert.match(styleSource, /#main-table th\[data-col="date"\],[\s\S]*width: 1%;/);
  assert.match(styleSource, /#main-table th\[data-col="social"\],[\s\S]*white-space: nowrap;/);
  assert.match(styleSource, /\.table-title-main \{/);
  assert.match(styleSource, /\.table-title-menu \{/);
});
