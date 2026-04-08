import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const readProjectFile = (relativePath) =>
  fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

test('index exposes definition modal and info triggers for author/channel/contributor', () => {
  const indexHtml = readProjectFile('index.html');

  assert.equal(
    indexHtml.includes('id="definitions-modal"'),
    true,
    'Expected definitions modal container to exist in index.html',
  );

  ['author', 'channel', 'contributor'].forEach((field) => {
    assert.equal(
      indexHtml.includes(`data-definition-field="${field}"`),
      true,
      `Expected definition trigger markup for ${field}`,
    );
  });
});

test('load-table derives optional value definitions from Dropdowns and exposes runtime definitionData', () => {
  const loadTableJs = readProjectFile('load-table.js');

  assert.equal(
    loadTableJs.includes('window.definitionData = {'),
    true,
    'Expected runtime definitionData object to be initialized',
  );

  assert.equal(
    loadTableJs.includes('CHANNEL_OWNER_DEFINITION_KEYS'),
    true,
    'Expected Channel owner value definitions to be read from Dropdowns aliases',
  );

  assert.equal(
    loadTableJs.includes('PUBLISHER_DEFINITION_KEYS'),
    true,
    'Expected Publisher value definitions to be read from Dropdowns aliases',
  );

  assert.equal(
    loadTableJs.includes('No definition provided yet.'),
    true,
    'Expected missing definition fallback copy for modal entries',
  );
});
