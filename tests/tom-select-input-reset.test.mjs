import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const readProjectFile = (relativePath) =>
  fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

test('Tom Select clears typed query after selecting an option', () => {
  const applyFiltersJs = readProjectFile('apply-filters.js');

  assert.equal(
    /onItemAdd\(\)\s*\{[\s\S]*this\.setTextboxValue\(''\);[\s\S]*this\.refreshOptions\(false\);/.test(applyFiltersJs),
    true,
    'Expected Tom Select onItemAdd hook to clear the textbox and refresh dropdown options',
  );
});
