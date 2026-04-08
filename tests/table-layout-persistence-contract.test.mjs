import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const readProjectFile = (relativePath) =>
  fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

test('table exposes full-column identity and layout controls for reorder and reset', () => {
  const indexHtml = readProjectFile('index.html');

  assert.match(indexHtml, /<th class="text-center" data-col="date">Date/);
  assert.match(indexHtml, /<th id="content-title-header" data-col="title">Content title/);
  assert.match(indexHtml, /<td class="text-center" data-col="date"><\/td>/);
  assert.match(indexHtml, /<td data-col="title"><\/td>/);
  assert.match(indexHtml, /id="col-order-list" class="col-order-list"/);
  assert.match(indexHtml, /class="col-order-item" draggable="true" data-col-key="date"/);
  assert.match(indexHtml, /class="col-order-item" draggable="true" data-col-key="social"/);
  assert.match(indexHtml, /data-col-key="social"[\s\S]*id="col-toggle-social" checked/);
  assert.match(indexHtml, /id="reset-table-layout-btn" class="col-picker-reset-btn" type="button">Reset layout<\/button>/);
});

test('apply-filters persists local table layout, reorders columns, and wires resize handles', () => {
  const applyFiltersJs = readProjectFile('apply-filters.js');
  const loadTableJs = readProjectFile('load-table.js');

  assert.match(applyFiltersJs, /const TABLE_LAYOUT_STORAGE_KEY = 'esridevs_table_layout_v1';/);
  assert.match(applyFiltersJs, /columnOrder: normalizeColumnOrder\(localTableLayout\?\.order\),/);
  assert.match(applyFiltersJs, /columnWidths: normalizeColumnWidths\(localTableLayout\?\.widths\),/);
  assert.match(applyFiltersJs, /localStorage\.setItem\(TABLE_LAYOUT_STORAGE_KEY, JSON\.stringify\(\{/);
  assert.match(applyFiltersJs, /const applyColumnOrderState = \(\) => \{/);
  assert.match(applyFiltersJs, /const computeAutoColumnWidths = \(\) => \{/);
  assert.match(applyFiltersJs, /const getVisibleTableColumnKeys = \(\) => \(/);
  assert.match(applyFiltersJs, /const resetTableHorizontalScroll = \(\) => \{/);
  assert.match(applyFiltersJs, /const desiredWidths = Object\.fromEntries\(/);
  assert.match(applyFiltersJs, /if \(desiredTotal >= availableWidth\) \{/);
  assert.match(applyFiltersJs, /const initColumnResizeHandles = \(\) => \{/);
  assert.match(applyFiltersJs, /const syncColumnResizeHandleVisibility = \(\) => \{/);
  assert.match(applyFiltersJs, /className = 'table-col-resize-handle'/);
  assert.match(applyFiltersJs, /closest\('\.col-order-item__toggle'\)/);
  assert.match(applyFiltersJs, /window\.addEventListener\('resize', \(\) => \{/);
  assert.match(applyFiltersJs, /window\.syncTableColumnLayout = syncTableColumnLayout;/);
  assert.match(loadTableJs, /syncTableLayout: window\.syncTableColumnLayout,/);
});

test('styles target columns by data-col so reordering does not break layout semantics', () => {
  const styleSource = readProjectFile('style.css');

  assert.match(styleSource, /#main-table th\[data-col="date"\],/);
  assert.match(styleSource, /#main-table th\[data-col="title"\],/);
  assert.match(styleSource, /#main-table th\[data-col="social"\],/);
  assert.match(styleSource, /\.table-col-resize-handle/);
  assert.match(styleSource, /\.col-order-list/);
  assert.match(styleSource, /\.table-container \{[\s\S]*overflow-x: hidden;/);
  assert.match(styleSource, /#main-table \{[\s\S]*table-layout: fixed;/);
  assert.match(styleSource, /border-right: 1px solid #dde7f8;/);
  assert.match(styleSource, /#main-table thead th\[data-col\]:hover,/);
  assert.match(styleSource, /#main-table thead th\[data-col\]:focus-within \{[\s\S]*z-index: 4;/);
  assert.match(styleSource, /content: '↔';/);
});
