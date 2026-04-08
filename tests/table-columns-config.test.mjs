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

test('default visible columns keep the table minimal: date, content title, and share', () => {
  const indexHtml = readProjectFile('index.html');
  const applyFiltersJs = readProjectFile('apply-filters.js');

  assert.match(indexHtml, /id="col-toggle-social" checked> Share<\/label>/);
  assert.doesNotMatch(indexHtml, /id="col-toggle-topic" checked/);
  assert.doesNotMatch(indexHtml, /id="col-toggle-category" checked/);

  assert.match(applyFiltersJs, /topic: false,/);
  assert.match(applyFiltersJs, /category: false,/);
});
