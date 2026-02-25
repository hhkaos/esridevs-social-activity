import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const readProjectFile = (relativePath) =>
  fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

test('contributor mapping supports both Contributor and Contributors field names', () => {
  const loadTableJs = readProjectFile('load-table.js');

  assert.equal(
    loadTableJs.includes("uniqueColumnValues(dropdownRows, ['Contributors', 'Contributor', 'Authors'])"),
    true,
    'Expected dropdown contributor extraction to include Contributors and Contributor',
  );

  assert.equal(
    loadTableJs.includes("pickFirst(entry, ['Contributors', 'Contributor', 'Authors'])"),
    true,
    'Expected row contributor mapping to include Contributors and Contributor',
  );
});
