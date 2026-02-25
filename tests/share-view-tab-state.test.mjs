import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const readProjectFile = (relativePath) =>
  fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

test('share URL stores tab in state and not as a separate query param', () => {
  const applyFiltersJs = readProjectFile('apply-filters.js');

  assert.equal(
    applyFiltersJs.includes('activeTab: getActiveTab(),'),
    true,
    'Expected serializable share state to include activeTab',
  );

  assert.equal(
    applyFiltersJs.includes("url.searchParams.delete('tab');"),
    true,
    'Expected buildShareUrl to avoid a separate tab query param',
  );
});

test('tab restore reads activeTab from decoded state', () => {
  const applyFiltersJs = readProjectFile('apply-filters.js');

  assert.equal(
    /const activeTabFromState =[\s\S]*parsedHashState\.activeTab/.test(applyFiltersJs),
    true,
    'Expected activeTabFromState to read activeTab from decoded share state',
  );

  assert.equal(
    applyFiltersJs.includes('activeTab: normalizeActiveTab(activeTabFromState),'),
    true,
    'Expected appState.activeTab to come from state only',
  );
});

test('setActiveTab uses Bootstrap Tab API when available and reapplies on load', () => {
  const applyFiltersJs = readProjectFile('apply-filters.js');

  assert.equal(
    applyFiltersJs.includes("const bootstrapTabApi = window.bootstrap?.Tab;"),
    true,
    'Expected setActiveTab to detect Bootstrap Tab API',
  );

  assert.equal(
    applyFiltersJs.includes('bootstrapTabApi.getOrCreateInstance(desiredTrigger).show();'),
    true,
    'Expected setActiveTab to synchronize via Bootstrap tab show()',
  );

  assert.equal(
    applyFiltersJs.includes("window.addEventListener('load', () => {"),
    true,
    'Expected restored tab state to be re-applied after full page load',
  );
});

test('tab restore is reapplied after initial data load completes', () => {
  const applyFiltersJs = readProjectFile('apply-filters.js');

  assert.equal(
    /window\.onDataLoaded = \(\) => \{[\s\S]*setActiveTab\(appState\.activeTab\);/.test(applyFiltersJs),
    true,
    'Expected onDataLoaded wrapper to reapply restored tab state after table render',
  );
});
