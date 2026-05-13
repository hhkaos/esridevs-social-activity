import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const readProjectFile = (relativePath) =>
  fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

test('filter popover scroll listener ignores scrolls inside TomSelect dropdown or popover', () => {
  const applyFiltersJs = readProjectFile('apply-filters.js');

  const scrollHandlerMatch = applyFiltersJs.match(
    /window\.addEventListener\(\s*'scroll'\s*,\s*\(event\)\s*=>\s*\{[\s\S]*?\}\s*,\s*true\s*\)/,
  );

  assert.notEqual(scrollHandlerMatch, null, 'Expected window scroll listener to receive the event object');

  const handlerSource = scrollHandlerMatch[0];

  assert.match(
    handlerSource,
    /filterPopoverEl\?\.contains\(target\)/,
    'Expected scroll handler to skip closing when scroll target is inside the popover',
  );
  assert.match(
    handlerSource,
    /closest\('\.ts-dropdown'\)/,
    'Expected scroll handler to skip closing when scroll target is inside a TomSelect dropdown',
  );
  assert.match(
    handlerSource,
    /closest\('\.ts-wrapper'\)/,
    'Expected scroll handler to skip closing when scroll target is inside a TomSelect wrapper',
  );
});

test('filter popover scroll listener returns early when no popover is active', () => {
  const applyFiltersJs = readProjectFile('apply-filters.js');

  const scrollHandlerMatch = applyFiltersJs.match(
    /window\.addEventListener\(\s*'scroll'\s*,\s*\(event\)\s*=>\s*\{[\s\S]*?\}\s*,\s*true\s*\)/,
  );

  assert.notEqual(scrollHandlerMatch, null);
  const handlerSource = scrollHandlerMatch[0];

  assert.match(
    handlerSource,
    /if\s*\(\s*!activeFilterTargetKey\s*\|\|\s*filterPopoverEl\?\.hidden\s*\)\s*return;/,
    'Expected scroll handler to early-return when no filter popover is active',
  );
});
