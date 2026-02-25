import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const readProjectFile = (relativePath) =>
  fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

const readSelectorZIndex = (css, selector) => {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`${escapedSelector}\\s*\\{[\\s\\S]*?z-index:\\s*(\\d+)\\s*;`, 'm');
  const match = css.match(regex);
  return match ? Number(match[1]) : null;
};

test('filter controls stack above the charts index in insights view', () => {
  const styleCss = readProjectFile('style.css');

  const filtersRowZIndex = readSelectorZIndex(styleCss, '.filters-row');
  const chartsIndexZIndex = readSelectorZIndex(styleCss, '.charts-index');

  assert.notEqual(filtersRowZIndex, null, 'Expected .filters-row to define a z-index');
  assert.notEqual(chartsIndexZIndex, null, 'Expected .charts-index to define a z-index');
  assert.equal(
    filtersRowZIndex > chartsIndexZIndex,
    true,
    'Expected .filters-row z-index to be higher than .charts-index',
  );
});

test('Tom Select dropdown z-index stays above sticky insights index', () => {
  const styleCss = readProjectFile('style.css');

  const dropdownZIndex = readSelectorZIndex(styleCss, '.ts-wrapper .ts-dropdown');
  const chartsIndexZIndex = readSelectorZIndex(styleCss, '.charts-index');

  assert.notEqual(dropdownZIndex, null, 'Expected .ts-wrapper .ts-dropdown to define a z-index');
  assert.notEqual(chartsIndexZIndex, null, 'Expected .charts-index to define a z-index');
  assert.equal(
    dropdownZIndex > chartsIndexZIndex,
    true,
    'Expected filter dropdown z-index to be higher than .charts-index',
  );
});
