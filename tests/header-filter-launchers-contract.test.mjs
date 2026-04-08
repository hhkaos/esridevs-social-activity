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

test('floating filter popover closes only on Escape or click outside, not on focus loss', () => {
  const indexHtml = readProjectFile('index.html');
  const applyFiltersJs = readProjectFile('apply-filters.js');

  assert.equal(
    indexHtml.includes('id="filter-popover" class="filter-popover" hidden aria-hidden="true" tabindex="-1"'),
    true,
    'Expected floating filter popover to be focusable for managed focus handling',
  );

  assert.equal(
    applyFiltersJs.includes('const isActiveTomSelectTarget = (target) => {'),
    true,
    'Expected floating filter popover logic to recognize Tom Select dropdown interactions as internal',
  );

  assert.equal(
    applyFiltersJs.includes('const isActiveTomSelectOpen = () => !!getActiveFilterControl()?.tomselect?.isOpen;'),
    true,
    'Expected floating filter popover logic to tolerate Tom Select staying open during multi-select interaction',
  );

  assert.equal(
    applyFiltersJs.includes('const shouldSuppressFilterPopoverClose = () => Date.now() < suppressFilterPopoverCloseUntil;'),
    true,
    'Expected floating filter popover logic to suppress close briefly after a Tom Select selection',
  );

  assert.equal(
    applyFiltersJs.includes('const FILTER_TARGET_KEY_BY_KEYWORD = {'),
    true,
    'Expected filter keywords to map back to the active popover target when a select change fires',
  );

  assert.equal(
    applyFiltersJs.includes('const FILTER_REOPEN_DELAY_MS = 180;'),
    true,
    'Expected the multi-select recovery path to wait briefly before restoring the floating popover',
  );

  assert.equal(
    applyFiltersJs.includes("if (isActiveTomSelectTarget(target)) return;"),
    true,
    'Expected outside-click handling to ignore clicks on the active Tom Select dropdown',
  );

  assert.equal(
    applyFiltersJs.includes('if (shouldSuppressFilterPopoverClose()) return;'),
    true,
    'Expected close handlers to tolerate the immediate post-selection transition',
  );

  // focusout must NOT close the popover — only mousedown outside and Escape should
  assert.equal(
    /filterPopoverEl\?\.addEventListener\('focusout'/.test(applyFiltersJs),
    false,
    'Expected floating filter popover NOT to close on focusout — only Escape or outside click should dismiss it',
  );

  assert.equal(
    /document\.addEventListener\('keydown',\s*\(event\)\s*=>\s*\{[\s\S]*event\.key !== 'Escape'[\s\S]*closeFilterPopover\(\{ restoreFocus: true \}\);/.test(applyFiltersJs),
    true,
    'Expected Escape to remain the keyboard shortcut for closing the floating filter popover',
  );

  assert.equal(
    /onItemAdd\(\)\s*\{[\s\S]*suppressFilterPopoverCloseUntil = Date\.now\(\) \+ 600;[\s\S]*window\.setTimeout\(\(\) => \{[\s\S]*this\.focus\(\);[\s\S]*this\.open\(\);[\s\S]*\}, 0\);/.test(applyFiltersJs),
    true,
    'Expected Tom Select item selection to keep the dropdown interaction alive for multi-select picking',
  );

  assert.equal(
    /if \(targetKey && e\.isTrusted && e\.currentTarget\?\.tomselect\) \{[\s\S]*suppressFilterPopoverCloseUntil = Date\.now\(\) \+ 600;[\s\S]*e\.currentTarget\.tomselect\.focus\(\);[\s\S]*e\.currentTarget\.tomselect\.open\(\);/.test(applyFiltersJs),
    true,
    'Expected the select change handler to restore focus and reopen the active Tom Select inside the visible popover',
  );

  assert.equal(
    /if \(targetKey && e\.isTrusted && e\.currentTarget\?\.tomselect\) \{[\s\S]*const triggerEl = \([\s\S]*activeFilterTargetKey === targetKey[\s\S]*getFilterTriggerButtons\(targetKey\)\[0\] \|\| activeFilterTriggerEl[\s\S]*\);[\s\S]*window\.setTimeout\(\(\) => \{[\s\S]*if \(filterPopoverEl\?\.hidden && triggerEl\) \{[\s\S]*openFilterPopover\(targetKey, triggerEl\);[\s\S]*return;[\s\S]*\}[\s\S]*e\.currentTarget\.tomselect\.focus\(\);[\s\S]*e\.currentTarget\.tomselect\.open\(\);[\s\S]*\}, FILTER_REOPEN_DELAY_MS\);/.test(applyFiltersJs),
    true,
    'Expected the select change handler to reopen the parent filter popover even if the active target state was already cleared',
  );

  // Synthetic events (e.g. from initApp) must NOT trigger the popover reopen path,
  // otherwise the topic popover opens automatically on every page load.
  assert.equal(
    applyFiltersJs.includes('e.isTrusted && e.currentTarget?.tomselect'),
    true,
    'Expected popover reopen to be gated on e.isTrusted so synthetic change events from initApp do not open the popover on load',
  );
});

test('results summary renders removable chips for each active filter', () => {
  const applyFiltersJs = readProjectFile('apply-filters.js');
  const styleCss = readProjectFile('style.css');

  assert.equal(
    applyFiltersJs.includes('const FILTER_CHIP_GROUPS = ['),
    true,
    'Expected filter chip metadata to be defined for the summary area',
  );

  assert.equal(
    applyFiltersJs.includes("chipList.className = 'table-results-summary__chips';"),
    true,
    'Expected results summary to render a dedicated chip list beside the count',
  );

  assert.equal(
    applyFiltersJs.includes("button.className = 'table-filter-chip';"),
    true,
    'Expected each active filter to render as a removable chip button',
  );

  assert.equal(
    applyFiltersJs.includes("const clearSingleFilterChip = (filterKey, filterValue) => {"),
    true,
    'Expected a dedicated removal path for clearing one filter chip at a time',
  );

  assert.equal(
    applyFiltersJs.includes("filtersSummaryEl?.addEventListener('click', (event) => {"),
    true,
    'Expected the summary area to handle chip dismissal clicks',
  );

  assert.equal(
    styleCss.includes('.table-results-summary__chips'),
    true,
    'Expected chip layout styles for the summary area',
  );

  assert.equal(
    styleCss.includes('.table-filter-chip'),
    true,
    'Expected chip button styles for applied filters',
  );
});
