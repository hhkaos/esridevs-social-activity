import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const require = createRequire(import.meta.url);
const { OPEN_SHEET_FIELD_ALIASES } = require('../activity-utils.js');

const readProjectFile = (relativePath) =>
  fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

test('people involved aliases support both renamed and legacy contributor headers', () => {
  assert.ok(OPEN_SHEET_FIELD_ALIASES.peopleInvolved.includes('People involved'));
  assert.ok(OPEN_SHEET_FIELD_ALIASES.peopleInvolved.includes('Contributors'));
  assert.ok(OPEN_SHEET_FIELD_ALIASES.peopleInvolved.includes('Contributor'));
});

test('load-table reuses shared aliases for renamed people involved headers', () => {
  const loadTableJs = readProjectFile('load-table.js');

  assert.equal(
    loadTableJs.includes('PEOPLE_INVOLVED_FIELD_KEYS'),
    true,
    'Expected dropdown people involved extraction to use shared aliases',
  );

  assert.equal(
    loadTableJs.includes('pickFirst(entry, PEOPLE_INVOLVED_FIELD_KEYS)'),
    true,
    'Expected row people involved mapping to use shared aliases',
  );
});
