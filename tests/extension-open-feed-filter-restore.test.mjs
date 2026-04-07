/**
 * Regression tests for the "Open feed" filter restore bug.
 *
 * When the extension opens the web app via ?state=, the flags object uses the
 * "include-only" format: { 'ArcGIS Online': 1 } (only selected items, no 0s for the rest).
 * The web app's native format is "all-enumerated": { 'ArcGIS Online': 1, 'JavaScript': 0 }.
 *
 * hasActiveRestriction must detect both formats, and loadMultiSelect must select only
 * items with val === 1 (not val !== 0, which would wrongly include undefined entries).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const readProjectFile = (relativePath) =>
  fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

test('hasActiveRestriction detects include-only format (values of 1, no 0s)', () => {
  const src = readProjectFile('apply-filters.js');
  // Must match values of 1 as active restrictions, not only 0.
  assert.ok(
    src.includes('value === 0 || value === 1'),
    'Expected hasActiveRestriction to treat value===1 as an active restriction (include-only format from extension)',
  );
});

test('loadMultiSelect selects only items with val === 1, not val !== 0', () => {
  const src = readProjectFile('apply-filters.js');
  // Must use strict equality to avoid selecting options absent from the include-only map.
  assert.ok(
    src.includes('hasRestrictions && val === 1'),
    'Expected loadMultiSelect to use val === 1 so that options not in the include-only map are not selected',
  );
  assert.ok(
    !src.includes('hasRestrictions && val !== 0'),
    'Expected loadMultiSelect to NOT use val !== 0 (would wrongly select undefined entries)',
  );
});
