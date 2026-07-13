import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { filterActivityRows } = require('../activity-utils.js');

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const applyFiltersJs = fs.readFileSync(path.join(projectRoot, 'apply-filters.js'), 'utf8');

// compactShareFlags lives in a browser script that touches the DOM at load time,
// so lift just that function out of the source to exercise it directly.
const loadCompactShareFlags = () => {
  const source = applyFiltersJs.match(
    /const FILTER_DIMENSIONS = [\s\S]*?const compactShareFlags = [\s\S]*?\n\};\n/,
  );
  assert.ok(source, 'Expected apply-filters.js to define compactShareFlags');
  // eslint-disable-next-line no-new-func
  return new Function(`${source[0]}\nreturn compactShareFlags;`)();
};

const dropdownOptions = Array.from({ length: 240 }, (_, i) => `Contributor ${i + 1}`);

const buildFullFlags = () => ({
  technologies: {},
  categories: {},
  channels: {},
  authors: {},
  // The UI writes a 0 for every unselected option, which is what used to bloat
  // the share link past 3000 characters.
  contributors: Object.fromEntries(
    dropdownOptions.map((name) => [name, name === 'Contributor 7' ? 1 : 0]),
  ),
  languages: {},
  featuredOnly: false,
  datePreset: 'thisYear',
  dateRange: { from: '2026-01-01', to: '2026-07-12' },
});

test('compactShareFlags keeps only selected values and drops empty dimensions', () => {
  const compactShareFlags = loadCompactShareFlags();
  const compacted = compactShareFlags(buildFullFlags());

  assert.deepEqual(compacted, {
    featuredOnly: false,
    datePreset: 'thisYear',
    dateRange: { from: '2026-01-01', to: '2026-07-12' },
    contributors: { 'Contributor 7': 1 },
  });
});

test('compacted share state stays small regardless of dropdown size', () => {
  const compactShareFlags = loadCompactShareFlags();
  const fullSize = JSON.stringify(buildFullFlags()).length;
  const compactSize = JSON.stringify(compactShareFlags(buildFullFlags())).length;

  assert.ok(fullSize > 3000, `Expected the uncompacted flags to be large, got ${fullSize}`);
  assert.ok(compactSize < 200, `Expected compacted flags under 200 chars, got ${compactSize}`);
});

test('compacted flags filter rows identically to the full flags', () => {
  const compactShareFlags = loadCompactShareFlags();
  const rows = [
    { Date: '2026-03-01', Contributor: 'Contributor 7', Title: 'kept' },
    { Date: '2026-03-02', Contributor: 'Contributor 9', Title: 'other contributor' },
    { Date: '2025-03-01', Contributor: 'Contributor 7', Title: 'out of range' },
  ];

  const full = filterActivityRows(rows, buildFullFlags());
  const compact = filterActivityRows(rows, compactShareFlags(buildFullFlags()));

  assert.deepEqual(compact, full);
  assert.deepEqual(compact.map((row) => row.Title), ['kept']);
});

test('share and RSS links both serialize the compacted flags', () => {
  assert.match(
    applyFiltersJs,
    /getSerializableShareState = \(\) => \(\{\s*filters: compactShareFlags\(flags\),/,
  );
  assert.match(
    applyFiltersJs,
    /LZString\.compressToBase64\(JSON\.stringify\(compactShareFlags\(flags\)\)\)/,
  );
});
