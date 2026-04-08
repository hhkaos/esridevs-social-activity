import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const readProjectFile = (relativePath) =>
  fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

test('Configure columns panel stays open during internal interaction and closes on focus leave', () => {
  const indexHtml = readProjectFile('index.html');
  const applyFiltersJs = readProjectFile('apply-filters.js');

  assert.equal(
    indexHtml.includes('id="col-picker-panel" class="col-picker-panel" tabindex="-1"'),
    true,
    'Expected Configure columns panel to be focusable so clicks within the panel do not drop focus',
  );

  assert.equal(
    /const openColumnPicker = \(\) => \{[\s\S]*colPickerPanel\.focus\(\);[\s\S]*\};/.test(applyFiltersJs),
    true,
    'Expected Configure columns panel to take focus when opened',
  );

  assert.equal(
    /colPickerPanel\?\.addEventListener\('keydown',\s*\(event\)\s*=>\s*\{[\s\S]*event\.key !== 'Escape'[\s\S]*closeColumnPicker\(\);/.test(applyFiltersJs),
    true,
    'Expected Configure columns panel to close on Escape instead of Space',
  );

  assert.equal(
    /colPickerWrap\?\.addEventListener\('focusout',\s*\(event\)\s*=>\s*\{[\s\S]*window\.setTimeout\(\(\) => \{[\s\S]*document\.activeElement[\s\S]*closeColumnPicker\(\);[\s\S]*\}, 0\);[\s\S]*\}\);/.test(applyFiltersJs),
    true,
    'Expected Configure columns panel to close only after focus actually leaves its wrapper',
  );

  assert.equal(
    /document\.addEventListener\('click',[\s\S]*colPickerPanel\?\.classList\.remove\('open'\)\)/.test(applyFiltersJs),
    false,
    'Expected Configure columns panel to avoid unconditional close on every document click',
  );
});
