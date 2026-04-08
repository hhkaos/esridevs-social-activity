import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const readProjectFile = (relativePath) =>
  fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

test('Configure columns panel closes on Escape and outside click only', () => {
  const indexHtml = readProjectFile('index.html');
  const applyFiltersJs = readProjectFile('apply-filters.js');

  assert.equal(
    indexHtml.includes('id="col-picker-panel" class="col-picker-panel" tabindex="-1"'),
    true,
    'Expected Configure columns panel to be focusable (tabindex="-1") for programmatic focus',
  );

  assert.equal(
    /const openColumnPicker = \(\) => \{[\s\S]*colPickerPanel\.focus\(\);[\s\S]*\};/.test(applyFiltersJs),
    true,
    'Expected Configure columns panel to take focus when opened',
  );

  // Panel closes on Escape
  assert.equal(
    /colPickerPanel\?\.addEventListener\('keydown',\s*\(event\)\s*=>\s*\{[\s\S]*event\.key !== 'Escape'[\s\S]*closeColumnPicker\(\);/.test(applyFiltersJs),
    true,
    'Expected Configure columns panel to close on Escape',
  );

  // Panel closes on mousedown outside colPickerWrap
  assert.equal(
    /document\.addEventListener\('mousedown',[\s\S]*colPickerPanel\?\.classList\.contains\('open'\)[\s\S]*colPickerWrap\?\.contains\(event\.target\)[\s\S]*closeColumnPicker\(\);/.test(applyFiltersJs),
    true,
    'Expected Configure columns panel to close when mousedown fires outside the wrapper',
  );

  // No focusout-based close (removing focus from the panel should not close it)
  assert.equal(
    /colPickerWrap\?\.addEventListener\('focusout'/.test(applyFiltersJs),
    false,
    'Expected Configure columns panel NOT to close on focusout — interaction inside the panel must not dismiss it',
  );
});
