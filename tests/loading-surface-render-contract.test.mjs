import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const readProjectFile = (relativePath) =>
  fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

test('table loading skeleton and error panel exist in markup with accessibility roles', () => {
  const indexHtml = readProjectFile('index.html');

  assert.equal(
    indexHtml.includes('id="table-loading-skeleton"'),
    true,
    'Expected index.html to include the table loading skeleton container',
  );

  assert.equal(
    indexHtml.includes('id="table-error-panel" class="table-error-panel" role="alert" hidden'),
    true,
    'Expected index.html to include an alert-role table error panel',
  );

  assert.equal(
    indexHtml.includes('id="loading-status" class="loading-status" role="status" aria-live="polite"'),
    true,
    'Expected loading status region to remain role=status for accessibility',
  );
});

test('load-table defines explicit table surface states and transitions', () => {
  const loadTableJs = readProjectFile('load-table.js');

  assert.equal(
    loadTableJs.includes('const TABLE_SURFACE_STATES = {'),
    true,
    'Expected table surface state constants to be defined',
  );

  assert.equal(
    loadTableJs.includes('const setTableSurfaceState = (state, { message = \'\' } = {}) => {'),
    true,
    'Expected setTableSurfaceState helper to drive loading/ready/error visibility',
  );

  assert.equal(
    loadTableJs.includes('setTableSurfaceState(TABLE_SURFACE_STATES.LOADING);'),
    true,
    'Expected loading state transition during render start',
  );

  assert.equal(
    loadTableJs.includes('setTableSurfaceState(TABLE_SURFACE_STATES.READY);'),
    true,
    'Expected ready state transition after render completes',
  );

  assert.equal(
    loadTableJs.includes('setTableSurfaceState(TABLE_SURFACE_STATES.ERROR, { message });'),
    true,
    'Expected error state transition for load failures',
  );
});

test('table rows are rendered incrementally through a lazy render pipeline', () => {
  const loadTableJs = readProjectFile('load-table.js');

  assert.equal(
    loadTableJs.includes('const TABLE_INITIAL_RENDER_COUNT = 60;'),
    true,
    'Expected lazy render pipeline to define an initial row batch size',
  );

  assert.equal(
    loadTableJs.includes('const TABLE_INCREMENTAL_RENDER_COUNT = 80;'),
    true,
    'Expected lazy render pipeline to define an incremental row batch size',
  );

  assert.equal(
    loadTableJs.includes('const maybeLoadMoreTableRows = () => {'),
    true,
    'Expected a lazy render helper that loads more rows near the viewport',
  );

  assert.equal(
    loadTableJs.includes('liveTableBody.appendChild(fragment);'),
    true,
    'Expected incremental batches to append directly into the live tbody',
  );

  assert.equal(
    loadTableJs.includes('window.updateRenderedTableRows = renderTableRows;'),
    true,
    'Expected table rendering to expose a shared updater for filter-driven rerenders',
  );
});

test('background refresh render failures trigger load error surface', () => {
  const loadTableJs = readProjectFile('load-table.js');

  assert.equal(
    /Failed to refresh table:[\s\S]*showLoadingError\(\);/.test(loadTableJs),
    true,
    'Expected refresh failure branch to show the table error surface',
  );
});

test('refresh change detection compares full sanitized activity payload', () => {
  const loadTableJs = readProjectFile('load-table.js');

  assert.equal(
    loadTableJs.includes('const freshSig = JSON.stringify(sanitizedFresh);'),
    true,
    'Expected refresh signature to include the full sanitized fresh dataset',
  );

  assert.equal(
    loadTableJs.includes('const cachedSig = JSON.stringify(sanitizedCached);'),
    true,
    'Expected refresh signature to include the full sanitized cached dataset',
  );

  assert.equal(
    loadTableJs.includes('sanitizedFresh.slice(0, 3)'),
    false,
    'Expected refresh signature to avoid first-3-row sampling',
  );
});
