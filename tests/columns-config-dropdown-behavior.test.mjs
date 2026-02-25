import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const readProjectFile = (relativePath) =>
  fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

test('Configure columns panel closes on Space and focus leave instead of any document click', () => {
  const applyFiltersJs = readProjectFile('apply-filters.js');

  assert.equal(
    /colPickerPanel\?\.addEventListener\('keydown',\s*\(event\)\s*=>\s*\{[\s\S]*event\.key !== ' '[\s\S]*closeColumnPicker\(\);/.test(applyFiltersJs),
    true,
    'Expected Configure columns panel to close on Space key within the panel',
  );

  assert.equal(
    /colPickerWrap\?\.addEventListener\('focusout',\s*\(event\)\s*=>\s*\{[\s\S]*closeColumnPicker\(\);/.test(applyFiltersJs),
    true,
    'Expected Configure columns panel to close when focus leaves its wrapper',
  );

  assert.equal(
    /document\.addEventListener\('click',[\s\S]*colPickerPanel\?\.classList\.remove\('open'\)\)/.test(applyFiltersJs),
    false,
    'Expected Configure columns panel to avoid unconditional close on every document click',
  );
});
