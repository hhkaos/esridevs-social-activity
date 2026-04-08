import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const readProjectFile = (relativePath) =>
  fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

test('filter controls live in a hidden dock and a reusable floating popover instead of a filters row', () => {
  const indexHtml = readProjectFile('index.html');

  assert.equal(
    indexHtml.includes('class="filters-row"'),
    false,
    'Expected the old filters row shell to be removed from the visible layout',
  );

  assert.equal(
    indexHtml.includes('id="filter-dock" class="filter-dock"'),
    true,
    'Expected hidden filter dock markup to keep the existing controls mounted',
  );

  assert.equal(
    indexHtml.includes('id="filter-popover" class="filter-popover" hidden'),
    true,
    'Expected reusable floating filter popover container to exist',
  );
});

test('table exposes contextual filter launchers, nearby results summary, and local reset/columns tools', () => {
  const indexHtml = readProjectFile('index.html');

  ['date-range', 'author', 'channel', 'language', 'contributors', 'topics', 'category'].forEach((target) => {
    assert.equal(
      indexHtml.includes(`data-filter-target="${target}"`),
      true,
      `Expected contextual table filter launcher for ${target}`,
    );
  });

  assert.match(
    indexHtml,
    /id="col-picker-btn"[\s\S]*class="table-tool-btn"/,
    'Expected visible-columns control to use the compact table-side icon button',
  );

  assert.equal(
    indexHtml.includes('id="filters-summary" class="table-results-summary"'),
    true,
    'Expected results summary to sit near the table shell',
  );

  assert.equal(
    indexHtml.includes('id="reset-filters-btn" class="table-tool-btn table-tool-btn--secondary"'),
    true,
    'Expected reset button to move into the table tools area',
  );

  assert.equal(
    indexHtml.includes('data-col="topic">Topic'),
    true,
    'Expected the table column formerly labelled Technology to be rendered as Topic',
  );
});

test('apply-filters wires contextual launchers to the floating filter popover', () => {
  const applyFiltersJs = readProjectFile('apply-filters.js');

  assert.equal(
    applyFiltersJs.includes('const FILTER_TARGETS = {'),
    true,
    'Expected filter target map to connect launcher buttons to existing controls',
  );

  assert.equal(
    applyFiltersJs.includes("document.querySelectorAll('[data-filter-target]').forEach((buttonEl) => {"),
    true,
    'Expected contextual filter launcher buttons to register click handlers',
  );

  assert.equal(
    applyFiltersJs.includes('const openFilterPopover = (targetKey, triggerEl) => {'),
    true,
    'Expected contextual launcher clicks to open a reusable floating popover',
  );

  assert.equal(
    applyFiltersJs.includes('filterPopoverContentEl.appendChild(wrapper);'),
    true,
    'Expected the existing control nodes to be reused inside the popover instead of duplicated',
  );

  assert.equal(
    applyFiltersJs.includes('restoreFilterTarget(activeFilterTargetKey);'),
    true,
    'Expected closing the popover to restore the moved filter control to its hidden dock slot',
  );
});
