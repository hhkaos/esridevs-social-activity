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

test('table rows are rendered via detached tbody and committed atomically', () => {
  const loadTableJs = readProjectFile('load-table.js');

  assert.equal(
    loadTableJs.includes('const workingTableBody = document.createElement(\'tbody\');'),
    true,
    'Expected render pipeline to build rows in a detached tbody',
  );

  assert.equal(
    loadTableJs.includes('workingTableBody.appendChild(fragment);'),
    true,
    'Expected render chunks to append to the detached tbody',
  );

  assert.equal(
    loadTableJs.includes('liveTableBody.replaceWith(workingTableBody);'),
    true,
    'Expected final tbody swap to happen once render is complete',
  );

  assert.equal(
    loadTableJs.includes('tableBody.appendChild(fragment);'),
    false,
    'Expected no direct chunk appends into the live tbody',
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
