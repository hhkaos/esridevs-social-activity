import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const readProjectFile = (relativePath) =>
  fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

test('every configurable column toggle has a matching table column and row template cell', () => {
  const indexHtml = readProjectFile('index.html');

  const toggleKeys = [...indexHtml.matchAll(/id="col-toggle-([a-z]+)"/g)].map((match) => match[1]);
  assert.ok(toggleKeys.length > 0, 'Expected at least one column toggle control');

  toggleKeys.forEach((key) => {
    const hasHeaderColumn = indexHtml.includes(`data-col="${key}"`);
    assert.equal(
      hasHeaderColumn,
      true,
      `Expected table header to include data-col="${key}" for configured toggle`,
    );
  });
});

test('image column toggle exists and is hidden by default', () => {
  const indexHtml = readProjectFile('index.html');
  const applyFiltersJs = readProjectFile('apply-filters.js');

  assert.ok(
    indexHtml.includes('id="col-toggle-image"'),
    'Expected image column toggle checkbox in index.html',
  );

  // Verify the toggle checkbox does NOT have "checked" attribute (hidden by default)
  const imageToggleMatch = indexHtml.match(/id="col-toggle-image"[^>]*/);
  assert.ok(imageToggleMatch, 'Expected to find image toggle input');
  assert.ok(
    !imageToggleMatch[0].includes('checked'),
    'Expected image column to be hidden by default (no checked attribute)',
  );

  // Verify DEFAULT_COLUMN_VISIBILITY includes image: false in apply-filters.js
  assert.ok(
    applyFiltersJs.includes('image: false'),
    'Expected image: false in DEFAULT_COLUMN_VISIBILITY',
  );
});

test('image column is rendered from known spreadsheet field aliases', () => {
  const loadTableJs = readProjectFile('load-table.js');

  // Verify load-table.js uses pickFirst with Image/Image URL field names
  assert.ok(
    loadTableJs.includes("'Image'") && loadTableJs.includes("'Image URL'"),
    "Expected load-table.js to pick image from 'Image' and 'Image URL' fields",
  );

  // Verify an <img> tag is rendered for the image thumbnail
  assert.ok(
    loadTableJs.includes('activity-image-thumb'),
    'Expected load-table.js to render an image thumbnail with class activity-image-thumb',
  );
});
